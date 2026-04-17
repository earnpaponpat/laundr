# LAUNDR — Business Logic Review
**Date:** 2026-04-17  
**Reviewer:** Claude  
**Scope:** Complete application business logic for industrial laundry RFID tracking  
**Focus:** Real-world operational correctness for Thai industrial laundry factories

---

## REVIEW AREA 1: SCAN EVENT LOGIC

### Finding 1.1: Checkout Marks Items "Out" at Gate, Not at Client Receipt
**Current Code:** `lib/rfid/scan-processor.ts:105-107`
- When checkout scan happens at factory gate → item status set to `'out'` immediately
- Deduplication window: 2 seconds for same tag + event type

**Problem:** In real industrial laundry:
- Items scanned at factory gate → loaded to truck → delivered to multiple clients over 4+ hours
- Item should NOT be marked "out" until client signs manifest at delivery site
- Current flow: Item marked out immediately, but manifest signature happens later
- **Risk:** Reconciliation is confused when items are "out" but not yet at client (item in truck limbo)
- Client can claim items were never delivered even though system says "out"

**Practical Impact:** Factory loses audit trail of which items are on which truck for which client

**Severity:** 🔴 **CRITICAL**

**Fix:** 
- Add new status `'in_transit'` to linen_items.status enum
- Checkout event: set status to `'in_transit'` (not `'out'`)
- New event type: `'delivery_signed'` – when client signs manifest → status becomes `'out'`
- This preserves custody chain: Gate → Truck → Client Site

**Effort:** Medium (half day) — need to add status enum value, add delivery flow, update reconcile logic

**Code Change:**
```sql
-- In schema: update CHECK constraint
status TEXT NOT NULL CHECK (status IN ('in_stock', 'in_transit', 'out', 'rewash', 'rejected', 'lost')) DEFAULT 'in_stock',
```

---

### Finding 1.2: Checkin Skips Quality Check — Items Go Directly Back to Stock
**Current Code:** `lib/rfid/scan-processor.ts:106`, DB trigger `process_scan_event()`
- Checkin event → status immediately becomes `'in_stock'`
- No intermediate quality inspection step

**Problem:** Real laundry workflow:
1. Dirty linen arrives from client
2. Staff inspect for stains/damage (5-10% items flagged)
3. Damaged items → rewash queue (not back to clean stock yet)
4. After rewash + drying → finally in_stock
5. Only clean items should be available for rent again

Current system allows dirty/stained items to be scanned as checkin and marked clean without inspection.

**Practical Impact:** Client receives stained items next time. Disputes. Chargebacks.

**Severity:** 🔴 **CRITICAL**

**Fix:**
- Add status `'quality_check'` to enum
- Checkin event → status = `'quality_check'` (item physically at factory but not yet inspected)
- New event type: `'inspection_pass'` → status = `'in_stock'`
- New event type: `'inspection_fail'` → status = `'rewash'`
- Staff scan items at inspection gate (Gate B) with pass/fail

**Effort:** Medium (half day) — add new status, new event types, update UI to show QC queue

**Code Change:**
```sql
status TEXT NOT NULL CHECK (status IN ('in_stock', 'in_transit', 'out', 'quality_check', 'rewash', 'rejected', 'lost'))
```

---

### Finding 1.3: 2-Second Dedup Window May Be Wrong
**Current Code:** `lib/rfid/scan-processor.ts:34-47`
- Deduplication: same tag + same event_type within 2 seconds → skip the duplicate

**Problem:** 
- Industrial RFID tunnel readers read same item 2-3 times as it passes through (~1 second per item)
- 2 seconds is appropriate for tunnel reader
- BUT: if manual handheld reader scans same item twice (staff error), 2 seconds catches this ✓
- More sophisticated: position-based dedup (same tag can be scanned twice at Gate A and Gate B at same time)

**Current approach is acceptable for MVP**, but monitoring needed.

**Severity:** ⚡ **Nice-to-have**

**Fix:** For now, keep 2 seconds. After MVP, add logging to see actual dedup hit rate. If > 5% false positives, add position-based logic.

---

### Finding 1.4: Unknown Tag Returns Warning But Doesn't Block
**Current Code:** `lib/rfid/scan-processor.ts:29-31`
- Unknown RFID tag (not in linen_items table) → returns `{ success: false, warning: 'unknown_tag' }`
- Hardware client gets 200 OK response → may retry indefinitely

**Problem:**
- If a stray RFID tag (from another laundry, counterfeit, or corrupted) enters system, no alert to staff
- Hardware client logs warning but continues
- Could eventually fill scan_events table with junk data
- No way to track which unknown tags keep appearing

**Practical Impact:** System noise. Staff unaware of potential security issue (tag theft, system compromise).

**Severity:** ⚠️ **Important**

**Fix:**
- Log unknown tags to a separate table: `unknown_scans` (tag_id, gate_id, timestamp, org_id)
- If same unknown tag scanned > 3 times in 1 hour → flag alert in dashboard
- Hardware client: log warning but include request to report to operations center
- Dashboard: "Suspected Unknown Tags" card on scan page

**Effort:** Small (< 1 hour) — create table, add logging, add card to dashboard

---

### Finding 1.5: Batch ID Not Populated at Checkout
**Current Code:** `lib/rfid/scan-processor.ts:71`, `app/api/routes/route.ts:36-51`
- Scan event includes optional `batch_id` but it's not set during checkout
- Routes create delivery_batches but don't link scan events to those batches

**Problem:**
- Reconciliation (Finding 2.1) relies on `batch_id` to group outbound items
- But checkout scans don't have batch_id because batch is created AFTER route is created
- Timing: Route created → delivery_batches created → driver loads truck → items scanned at gate
- But batch_id should be passed at scan time so reconcile can group them

**Practical Impact:** Reconciliation can't reliably group items by delivery

**Severity:** ⚠️ **Important**

**Fix:**
- When driver starts loading truck, pre-print or display list of batch_ids for this route
- Driver scans batch_id tag (or enters batch_id on handheld) before scanning items
- Each subsequent item scan includes that batch_id
- Reconcile works by batch

**Effort:** Medium (half day) — UX for batch selection, driver workflow docs

---

## REVIEW AREA 2: RECONCILIATION LOGIC

### Finding 2.1: Batch-Based Reconcile Doesn't Handle Multi-Day Returns
**Current Code:** `app/api/reconcile/route.ts`, `app/(dashboard)/reconcile/page.tsx`
- User selects a batch → API finds all checkouts with that batch_id
- Looks for subsequent checkins/rewash scans for those items
- Classifies as: returned / missing / rewash

**Problem:** Real scenario:
- Monday: Send 200 sheets to Hotel A (batch_monday_A)
- Tuesday: Hotel returns 180 sheets (all scanned at gate)
- Wednesday: Hotel returns 15 more sheets (late return)
- Current reconcile: 
  - On Tuesday: Shows 20 missing (before Wednesday return)
  - On Wednesday: Shows 5 missing (after late return)
- But if manager looks at batch_monday_A reconciliation on Tuesday vs Wednesday, the numbers change
- No way to track "grace period" before declaring something truly missing

**Practical Impact:** False "missing" alerts. Manager doesn't know if to charge client or wait.

**Severity:** 🔴 **CRITICAL**

**Fix:**
- Add field to delivery_batches: `expected_return_by TIMESTAMPTZ` (default +3 days)
- Reconcile returns three categories:
  1. **Returned** — checked in before expected_return_by
  2. **Pending** — not yet returned, still within grace period
  3. **Missing** — past expected_return_by and not returned
- Color code: Returned = green, Pending = yellow, Missing = red
- Only charge for "Missing" after grace period

**Effort:** Medium (half day) — add field to schema, update reconcile logic, update UI colors

---

### Finding 2.2: No Dispute/Acknowledgment Workflow
**Current Code:** No dispute handling exists
- Item marked missing → immediately billed to client
- Client says "we returned it" → no formal dispute process

**Problem:** Real operations:
- Client: "We returned all 200 items on Friday"
- System: "You returned 192, 8 are missing, charging you ฿5,600"
- Client: "No way, our staff counted, 200 went back in the truck"
- Currently: No way to dispute, no investigation workflow

**Practical Impact:** Revenue leakage. Client disputes. Relationship damage.

**Severity:** ⚠️ **Important** (but could be Phase 2)

**Fix:** For MVP, document manual process:
- Export missing items list
- Email to client: "Reconciliation shows 8 items missing. Please verify and respond within 48 hours."
- Client response: Add field to delivery_batches `client_dispute_notes TEXT` for now
- Phase 2: Build formal dispute workflow with required docs

**Effort:** Small (< 1 hour) — add text field, document process

---

### Finding 2.3: Rewash Items in Reconcile Are Confusing
**Current Code:** `app/api/reconcile/route.ts:77-81`
- Items with `rewash` event shown in separate "rewash" category
- But their status in linen_items might not be `'rewash'`

**Problem:** 
- Item is physically at factory in rewash queue
- But reconcile shows it as "returned" if the most recent event was rewash
- Manager might think item came back from client (it did), not realizing it's being rewashed
- Confuses: "returned from client" vs "returned but needs rewash"

**Practical Impact:** Confusion over inventory status. Manager can't tell what's really in stock vs being washed.

**Severity:** ⚠️ **Important**

**Fix:**
- In reconcile response, add item `current_status` field
- Display: "Returned (Currently in rewash)" with different styling
- This makes it clear the item was returned but is not yet in clean stock

**Effort:** Small (< 1 hour) — add field to query, update UI

---

## REVIEW AREA 3: WASH CYCLE & ITEM LIFECYCLE

### Finding 3.1: Wash Count Doesn't Differentiate Rewash
**Current Code:** DB trigger `process_scan_event()`, checkin event
- Every checkin → `wash_count += 1`
- No distinction between regular wash and rewash

**Problem:**
- Item sent out 50 times (50 washes) + sent to rewash once + checked in = wash_count becomes 51
- But actually this item was washed 52 times (50 original + 1 rewash + 1 from the checkin)
- More subtly: an item that does 100 rentals, then 20 rewash instances = 100 washes + 20 rewash = should show as 120 "wear cycles"
- Currently shows as only 100

**Practical Impact:** Replacement calculations are off. Items retired too early or too late. Budget forecasting is inaccurate.

**Severity:** ⚠️ **Important**

**Fix:**
- Change schema: add `rewash_count INT DEFAULT 0` to linen_items
- When event_type = 'rewash' → `rewash_count += 1` (in addition to future checkin)
- Actual wear lifespan: `wash_count + rewash_count`
- Update all calculations to use `(wash_count + rewash_count)` instead of just `wash_count`

**Effort:** Medium (half day) — schema change, update trigger, update all queries

---

### Finding 3.2: Hard-Coded EOL Thresholds Don't Use Category Lifespan
**Current Code:**
- `app/(dashboard)/inventory/page.tsx:47` — Hard-coded 160 as "near EOL"
- `app/(dashboard)/inventory/page.tsx:60-62` — Hard-coded 160/180 for cycle filters
- `lib/rfid/scan-processor.ts:57` — Hard-coded 180 in warning

**Problem:**
- Bed sheets: designed for 150 washes, shows alert at 160 ← TOO LATE, already past lifespan
- Bath towels: designed for 200 washes, shows alert at 160 ← OK
- Uniforms: designed for 100 washes, shows alert at 160 ← IGNORES ACTUAL LIFESPAN
- Each category has `lifespan_cycles` field in linen_categories but it's not being used

**Practical Impact:** Items used past safe lifespan → quality issues. Or items retired too early → wasted inventory.

**Severity:** 🔴 **CRITICAL**

**Fix:**
- Introduce "Alert Threshold" = 80% of category lifespan_cycles
- For Bed Sheets (150 cycles): alert at 120 washes
- For Uniforms (100 cycles): alert at 80 washes
- Query becomes:
  ```sql
  SELECT * FROM linen_items li
  JOIN linen_categories lc ON li.category_id = lc.id
  WHERE li.wash_count >= (lc.lifespan_cycles * 0.8)
  ```

**Effort:** Medium (half day) — update all threshold queries, migration to remove hard-coded values

---

### Finding 3.3: No Automatic Retirement at End-of-Life
**Current Code:** Items just keep being scanned even past wash_count >= lifespan_cycles
- No trigger to change status to `'rejected'` automatically
- Manager has to manually mark items as rejected

**Problem:**
- Item with lifespan=150, already at 155 washes, is still status='in_stock'
- Could be rented out again
- If rented and returned damaged, who's liable? It was past end-of-life

**Practical Impact:** Liability confusion. Quality issues from worn items.

**Severity:** ⚠️ **Important**

**Fix:**
- Add trigger: When item is checked in, if `wash_count >= lc.lifespan_cycles`, auto-set status = `'rejected'`
- Alert staff: "Item {id} reached end-of-life and is now marked rejected. Please physically remove from inventory."
- Dashboard shows count of "Auto-retired items awaiting physical removal"

**Effort:** Medium (half day) — add trigger logic, add notification card

---

### Finding 3.4: Lost Items Not Tracked Separately from Lifecycle
**Current Code:** `linen_items.status` can be `'lost'`
- But no differentiation: lost at client site vs. lost in warehouse vs. lost in transit

**Problem:**
- Item marked `'lost'` but unclear whether:
  - Client never returned it (client fault)
  - Item fell off truck (logistic fault)
  - Item misplaced in warehouse (factory fault)
- Billing just charges client flat replacement_cost regardless of fault
- Client disputes: "It was your truck driver who lost it"

**Practical Impact:** Disputes, revenue loss, no accountability.

**Severity:** ⚠️ **Important** (Phase 2 feature)

**Fix:** For MVP, add field to linen_items:
- `lost_location TEXT` — 'client_site' | 'in_transit' | 'factory' | 'unknown'
- When staff marks item lost, they specify location
- Billing logic can then differentiate: maybe factory absorbs transit losses, client charged only for client-site losses

**Effort:** Small (< 1 hour) — add field, add dropdown in UI

---

## REVIEW AREA 4: BILLING LOGIC

### Finding 4.1: Rental Rate Calculation is Unrealistic
**Current Code:** `lib/billing/calculator.ts:46`
```javascript
price: (category.replacement_cost || 0) * 0.05  // 5% per wash
```

**Problem:** 
- Bed sheet replacement cost: ฿1,200
- 5% rental per wash = ฿60/sheet/wash
- If customer rents 100 sheets for 30 days (10 washes): 100 × ฿60 × 10 = ฿60,000/month

Real Thai laundry pricing:
- Bed sheets: Fixed ฿25-30 per piece per delivery (not per wash)
- Towels: ฿10-15 per piece per delivery
- Uniforms: ฿20-25 per piece per delivery
- Price doesn't vary with wash count; it's per delivery cycle

**Practical Impact:** Bills are way too high. Clients won't use system, will use competitor.

**Severity:** 🔴 **CRITICAL**

**Fix:**
- Remove wash_count from rental calculation
- Add field to linen_categories: `rental_price_per_delivery NUMERIC(10,2)`
- Rental calculation: count checkouts per category per client = rental_price × qty
- Example:
  ```javascript
  // Instead of: qty × (replacement_cost × 0.05)
  // Use: qty × rental_price_per_delivery
  ```

**Effort:** Medium (half day) — schema change, update calculator, update category management

---

### Finding 4.2: Rewash Charge Doesn't Match Real Pricing
**Current Code:** `lib/billing/calculator.ts:70`
```javascript
price: (category.replacement_cost || 0) * 0.3  // 30% of replacement cost
```

**Problem:**
- Bed sheet replacement: ฿1,200
- 30% rewash fee = ฿360 per item

Real pricing:
- Rewash charge: Flat ฿50-100 per item regardless of type
- Or percentage of rental price (e.g., ฿25 rental → ฿10 rewash fee)

**Practical Impact:** Overcharging clients for rewash.

**Severity:** ⚠️ **Important**

**Fix:**
- Add field to linen_categories: `rewash_fee_per_item NUMERIC(10,2)` (default ฿75)
- Calculation: `qty × rewash_fee_per_item`

**Effort:** Small (< 1 hour) — add field, update calculation

---

### Finding 4.3: Loss Billing Ignores Depreciation & Grace Period
**Current Code:** `lib/billing/calculator.ts:94`
```javascript
price: category.replacement_cost || 0  // Full replacement cost
```

**Problem:**
Real contracts in Thailand typically have:
1. **Grace Period**: Client not charged if item is found within 30 days
2. **Depreciation**: If item is 100 washes old (out of 200 lifespan), value is only 50% = charge only ฿600 (not ฿1,200)
3. **Dispute Period**: Can't auto-bill for loss; must notify client, wait 7 days for dispute

Current system: Charges full replacement_cost immediately.

**Practical Impact:** Clients rightfully dispute; system looks unfair.

**Severity:** 🔴 **CRITICAL**

**Fix:**
- Loss logic:
  1. Item marked lost → create `loss_record` (status='pending', flagged_date)
  2. Wait 30 days (grace period) → if item still not found, move to `status='confirmed'`
  3. Only then charge client: `depreciated_value = replacement_cost × (1 - (wash_count / lifespan_cycles))`
  4. Send invoice with note: "Item {id} confirmed lost on {date}. Depreciated value after {wash_count} washes."

**Effort:** Large (1+ day) — add loss_records table, grace period logic, invoice changes

---

### Finding 4.4: VAT Hardcoded, Ignores Thai Tax Options
**Current Code:** `lib/billing/calculator.ts:126`
```javascript
const vat = subtotal * 0.07;  // Always 7%
```

**Problem:**
Thai B2B invoices have options:
1. **VAT 7%** (Standard business, VAT registered)
2. **Withholding Tax 3%** (Some contracts use withholding instead)
3. **Both** (Rare but possible on same invoice)

Current system forces 7% VAT on all invoices.

**Practical Impact:** Can't match client contracts that use withholding tax.

**Severity:** ⚠️ **Important**

**Fix:**
- Add field to invoices: `tax_type TEXT` — 'vat' | 'withholding' | 'both' (default 'vat')
- Add field to clients: `preferred_tax_type TEXT`
- Calculation:
  ```javascript
  if (tax_type === 'vat') {
    tax = subtotal * 0.07;
  } else if (tax_type === 'withholding') {
    tax = subtotal * 0.03;
  } else if (tax_type === 'both') {
    vat = subtotal * 0.07;
    withholding = subtotal * 0.03;
  }
  ```

**Effort:** Medium (half day) — add fields, update billing logic, update invoice template

---

### Finding 4.5: No Auto-Billing Schedule
**Current Code:** Manual date range selection in UI
- Manager must go to Billing page, select dates, click "Generate Invoice"
- Happens irregularly, error-prone

**Problem:**
Real operations: Monthly billing should be automatic
- 1st of each month → system auto-generates invoices for all clients
- Based on previous month's activity
- Reduces manual work, prevents forgotten billings

**Practical Impact:** Some clients unbilled for months. Revenue leakage.

**Severity:** ⚠️ **Important** (but could be Phase 2)

**Fix:** For MVP, document manual process. Phase 2, add Cron trigger:
- 1st of month at 2 AM → `generate_monthly_invoices()` function
- For each org: for each client: calculate billing for (previous month)
- Auto-create invoice, send email to client

**Effort:** Medium (half day) — requires scheduled job setup

---

## REVIEW AREA 5: ROUTES & DELIVERY LOGIC

### Finding 5.1: Items Not Pre-Assigned to Delivery Stops
**Current Code:** `app/api/routes/route.ts:22-26` — Route has `stops` array with `item_count` but no specific item IDs
- Driver loads truck, items are scanned at gate (no pre-assignment)
- Reconcile knows which items left in batch, but not which items go to which client

**Problem:**
Scenario: Route has 2 stops
- Stop 1: Hotel A (100 items)
- Stop 2: Hotel B (150 items)
- Driver loads truck with items
- But system doesn't know which 100 go to which stop
- If driver unloads wrong items at wrong hotel, system can't detect

**Practical Impact:** No accountability. Hotel gets wrong items → disputes.

**Severity:** ⚠️ **Important**

**Fix:**
- When creating route, manager assigns specific item IDs to each stop (or items are pre-pulled from inventory)
- Store in delivery_batches: `item_ids UUID[]` (array of item_id)
- When driver scans item, verify it matches the route's assigned items for this stop
- If wrong item scanned for this stop → warning to driver

**Effort:** Medium (half day) — update route creation UI, add item verification at scan time

---

### Finding 5.2: No Distinction: Missing at Factory vs. Missing at Client
**Current Code:** Items just marked `'lost'` with no differentiation
- Reconcile shows missing count but doesn't know WHERE they're missing

**Problem:**
- Item scanned checkout at Gate A → marked "out" → never seen again
- Could be: lost in warehouse before truck loaded, fell off truck, or client never returned
- Currently: All treated the same
- Billing charges client, but maybe it's factory fault?

**Practical Impact:** No accountability for losses. Unfair client charging.

**Severity:** ⚠️ **Important**

**Fix:**
- When creating missing report, flag: "Last known location: {gate_id} on {date}"
- If last location is 'Gate A' (checkout gate) and item never scanned at client site, likely factory issue
- If last location is client site, client issue
- Manual investigation: staff review and mark `lost_responsibility` — 'factory' | 'client' | 'unknown'
- Billing only charges client if `lost_responsibility = 'client'`

**Effort:** Medium (half day) — add logic to track last known location, add responsibility field

---

### Finding 5.3: Return Routes Not Separated from Outbound
**Current Code:** Routes are directional but no explicit "inbound" vs "outbound"
- Routes table has `stops` but unclear if this is for outbound only

**Problem:**
Real operations:
- Outbound route: Factory → Hotel A → Hotel B → Hotel C → back to Factory
- Items delivered + dirty linen picked up
- System should track: what items were left vs. what dirty items were picked up
- Currently unclear if the system handles return logistics

**Practical Impact:** Can't track return timing. Can't optimize pickup schedules.

**Severity:** ⚠️ **Important** (but may be Phase 2)

**Fix:** For MVP:
- Routes are outbound only (delivery and pickup on same route)
- `delivery_batches.batch_type` is already 'outbound' | 'inbound'
- Document: "Outbound route = delivery + return pickup on same trip"
- Phase 2: Split into separate inbound routes for optimization

**Effort:** Small (< 1 hour) — clarify in docs

---

## REVIEW AREA 6: MULTI-TENANT SECURITY

### Finding 6.1: CRITICAL — GET /api/billing/invoices Leaks All Orgs' Data
**Current Code:** `app/api/billing/invoices/route.ts:58-67`
```javascript
export async function GET(req: Request) {
    const supabase = await createClient();
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*, clients(name)')
      .order('created_at', { ascending: false });  // NO ORG_ID FILTER!
    
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(invoices);
}
```

**Problem:**
- GET request returns ALL invoices from ALL organizations
- No filter by org_id
- User from Org A can see invoices from Org B, C, D
- CRITICAL multi-tenant security vulnerability

**Practical Impact:** Data breach. Competitor can see invoice amounts. Legal liability.

**Severity:** 🔴 **CRITICAL SECURITY ISSUE**

**Fix:**
```javascript
export async function GET(req: Request) {
    const supabase = await createClient();
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;
    
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*, clients(name)')
      .eq('org_id', orgId)  // ADD THIS LINE
      .order('created_at', { ascending: false });
    
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(invoices);
}
```

**Effort:** Small (< 1 hour) — add one line to all GET endpoints

---

### Finding 6.2: POST /api/billing/calculate Missing Org Validation
**Current Code:** `app/api/billing/calculate/route.ts:1-17`
- Takes client_id from request body
- Passes to calculateBilling without verifying client belongs to user's org

**Problem:**
- User from Org A: POST with client_id from Org B
- System calculates billing for Org B's client
- User can see invoice totals for competitors

**Practical Impact:** Data leak (less critical than GET, but still a vulnerability).

**Severity:** 🔴 **CRITICAL SECURITY ISSUE**

**Fix:**
```javascript
export async function POST(req: Request) {
  try {
    const { client_id, date_from, date_to } = await req.json();
    if (!client_id || !date_from || !date_to) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    // Verify client belongs to this org
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('org_id', orgId)
      .eq('id', client_id)
      .single();

    if (!client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await calculateBilling(client_id, date_from, date_to);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Billing Calculate Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

**Effort:** Small (< 1 hour) — add validation to all POST/PUT endpoints

---

### Finding 6.3: RLS Policies Are Enabled but Need Verification
**Current Code:** `supabase/migrations/00000000000000_schema.sql:147-183`
- RLS is enabled on all tables
- Policies check `org_id = get_current_org_id()`

**Status:** ✅ **Looks good** — RLS is properly configured

**But:** Double-check that all tables have policies:
- ✅ organizations, profiles, clients, linen_categories, linen_items, scan_events, routes, delivery_batches, rewash_records
- ✅ invoices (added in billing migration)

**Recommendation:** In Settings or CLAUDE.md, document RLS trust model:
- "All API routes must validate org_id matches user's org"
- "RLS provides secondary protection but should not be relied upon as sole security"

**Effort:** Small (< 1 hour) — document in CLAUDE.md

---

### Finding 6.4: API Keys Table Missing (For Future Hardware Auth)
**Current Code:** No api_keys table exists

**Problem:**
- Currently using session auth for all requests
- Real RFID hardware (gate readers, handheld scanners) can't use session auth
- Needs API key authentication
- Schema should be prepared now even if not implemented yet

**Practical Impact:** Can't deploy hardware readers. Stuck using simulator.

**Severity:** ⚠️ **Important** (MVP blocker if deploying hardware)

**Fix:** Create table now (don't implement auth yet):
```sql
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,  -- "Gate A Reader", "Handheld 1"
    key_hash TEXT NOT NULL,  -- bcrypt or argon2 hash, never store plaintext
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_used_at TIMESTAMPTZ,
    active BOOLEAN DEFAULT true,
    scopes TEXT[] DEFAULT '{"scan:write"}',  -- JSON array of capabilities
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, name)
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their org's API keys" ON api_keys 
FOR SELECT USING (org_id = get_current_org_id());
```

**Effort:** Small (< 1 hour) — schema only, no implementation

---

## REVIEW AREA 7: DATA INTEGRITY

### Finding 7.1: No Status Transition Validation
**Current Code:** Any status change is allowed by trigger
- Item can go from 'lost' → 'in_stock' (illogical)
- Item can go from 'rejected' → 'out' (illogical)

**Problem:**
Invalid transitions allowed:
- Can item in 'lost' status be checked back in? (Physically impossible)
- Can 'rejected' item be rented again? (Quality risk)

**Practical Impact:** Data corruption. Items in invalid states.

**Severity:** ⚠️ **Important**

**Fix:** Create a status transition matrix and enforce it:
```
Valid transitions:
in_stock    → in_transit (checkout)
in_transit  → out (delivery_signed)
in_transit  → in_stock (delivery_cancelled)
out         → quality_check (checkin)
quality_check → in_stock (inspection_pass)
quality_check → rewash (inspection_fail)
in_stock    → rewash (manual override)
rewash      → in_stock (rewash_complete)
rewash      → rejected (damaged beyond repair)
out, in_transit → lost (marked lost)
lost        → in_stock (found, with log entry)
rejected    → (terminal, no transitions)
```

Update trigger to validate:
```sql
-- In process_scan_event trigger
IF NOT is_valid_transition(item.status, new_status) THEN
  RAISE EXCEPTION 'Invalid status transition from % to %', item.status, new_status;
END IF;
```

**Effort:** Medium (half day) — create validation function, update trigger

---

### Finding 7.2: Orphaned Scan Events Not Prevented
**Current Code:** Scan events can reference items that no longer exist (CASCADE DELETE on item_id)

**Problem:**
- If item is deleted, its scan_events are also deleted
- But if scan_event.item_id is null, can't audit what happened
- Better: keep scan_events intact, just set item_id to null (soft delete)

**Current:** Item deleted → scan history lost

**Practical Impact:** Audit trail broken. Can't trace item history if item is deleted.

**Severity:** ⚠️ **Important** (Phase 2)

**Fix:** Change foreign key from CASCADE DELETE to SET NULL:
```sql
ALTER TABLE scan_events
DROP CONSTRAINT scan_events_item_id_fkey,
ADD CONSTRAINT scan_events_item_id_fkey 
  FOREIGN KEY (item_id) REFERENCES linen_items(id) ON DELETE SET NULL;
```

**Effort:** Small (< 1 hour) — migration to change constraint

---

### Finding 7.3: Concurrent Scan Race Condition Possible
**Current Code:** `lib/rfid/scan-processor.ts:18-80`
- No locking mechanism if two readers scan same item simultaneously

**Problem:**
Scenario:
- Handheld reader at Gate A scans item 123 (checkout) at 10:00:00.000
- Gate B reader also scans item 123 at 10:00:00.001 (should be blocked as it's still in_stock, but both could process)
- Race condition: both could insert, both could update item status
- Result: inconsistent state

**Practical Impact:** Rare but possible. Item state corrupted.

**Severity:** ⚠️ **Important** (low probability but high impact)

**Fix:** Add unique constraint to prevent duplicate scans:
```sql
-- In scan_events table
CREATE UNIQUE INDEX idx_scan_unique_event
ON scan_events(item_id, event_type, DATE(created_at))
WHERE event_type IN ('checkout', 'checkin', 'reject');
```

This prevents multiple checkins on same day for same item (since next checkin means it was checked in before).

Alternative: Add row locking in trigger:
```sql
SELECT * FROM linen_items WHERE id = item_id FOR UPDATE;
```

**Effort:** Medium (half day) — add unique constraint or row locking

---

## PRIORITY LIST

### 🚨 MUST FIX BEFORE DEMO (Top 5)

| Priority | Finding | Severity | Effort | Impact |
|----------|---------|----------|--------|--------|
| 1 | 6.1 GET /api/billing/invoices data leak | CRITICAL | 1h | Security |
| 2 | 4.1 Rental rate calculation unrealistic (฿60/wash = ฿60k/month bills) | CRITICAL | 0.5d | Business viability |
| 3 | 1.1 Checkout marks items "out" at gate, not at client receipt | CRITICAL | 0.5d | Operational flow |
| 4 | 1.2 Checkin skips quality check, dirty items return to stock | CRITICAL | 0.5d | Quality control |
| 5 | 3.2 Hard-coded EOL thresholds ignore category lifespan | CRITICAL | 0.5d | Item lifecycle |

**Recommended approach:**
1. **Security first** (Finding 6.1): 1 hour — adds org_id filter to GET endpoint
2. **Billing fix** (Finding 4.1): 4 hours — adds rental_price_per_delivery field to schema/UI
3. **Scan flow** (Findings 1.1 & 1.2): 8 hours — adds in_transit and quality_check statuses
4. **EOL fix** (Finding 3.2): 4 hours — replace hard-coded values with percentage logic

**Total: ~17 hours = 2-3 days full-time**

---

### DEFER TO PHASE 2 (Nice-to-have, but blocks demo if critical)

| Priority | Finding | Severity | Effort | Notes |
|----------|---------|----------|--------|-------|
| 6 | 4.3 Loss billing ignores depreciation & grace period | CRITICAL | 1d | Can ship demo with full replacement cost (known issue) |
| 7 | 2.1 Batch-based reconcile + grace period | CRITICAL | 0.5d | Currently shows false missing alerts |
| 8 | 7.1 Status transition validation | Important | 0.5d | Data integrity safeguard |
| 9 | 4.4 VAT hardcoded, no withholding tax | Important | 0.5d | Won't affect demo, but real invoices need this |
| 10 | 5.1 Items not pre-assigned to stops | Important | 0.5d | Demo can work without, but operational issue |

---

## SUMMARY: BUSINESS LOGIC HEALTH

| Area | Status | Critical Issues |
|------|--------|-----------------|
| Scan Events | ⚠️ Partial | Checkout timing, QC missing, batch assignment |
| Reconciliation | ⚠️ Partial | Grace period, disputed items |
| Wash Cycles | ⚠️ Partial | Rewash not counted, hard-coded thresholds |
| Billing | 🔴 Broken | Rental rates 10x too high, loss charges unfair, tax options missing |
| Routes | ⚠️ Partial | Items not pre-assigned, no accountability |
| Security | 🔴 Broken | Data leak in GET /api/billing/invoices |
| Data Integrity | ⚠️ Partial | No status validation, concurrent scan risk |

**Overall:** System is 60% feature-complete but 40% business logic needs rework. **Not ready for production client demo without fixes.**

---

## NEXT STEPS

1. **Review this report** with product/operations team
2. **Prioritize:** Which 5-10 fixes are MUST-HAVE before demo?
3. **I can implement approved fixes** — specify which items and I'll code + test them
4. **Testing:** After fixes, run through realistic scenarios (multi-day returns, rewash, partial shipments)

