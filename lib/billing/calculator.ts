import { createClient } from "@/lib/supabase/server";

export interface BillingBreakdownItem {
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;
  type: 'rental' | 'rewash' | 'loss';
}

export interface BillingResult {
  client_id: string;
  date_from: string;
  date_to: string;
  items: BillingBreakdownItem[];
  subtotal: number;
  vat: number;
  total: number;
  rewash_total: number;
  loss_total: number;
}

export async function calculateBilling(clientId: string, from: string, to: string): Promise<BillingResult> {
  const supabase = await createClient();
  const dateFrom = new Date(from).toISOString();
  const dateTo = new Date(to).toISOString();

  // 1. Calculate Rental (from scan_events checkout)
  const { data: rentalEvents } = await supabase
    .from('scan_events')
    .select('item_id, linen_items(category_id, linen_categories(name, replacement_cost))')
    .eq('client_id', clientId)
    .eq('event_type', 'checkout')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo);

  const rentalMap: Record<string, { name: string, qty: number, price: number }> = {};
  rentalEvents?.forEach((e: any) => {
    const category = e.linen_items?.linen_categories;
    if (!category) return;
    const catId = e.linen_items.category_id;
    if (!rentalMap[catId]) {
      rentalMap[catId] = { 
        name: `${category.name} Rental`, 
        qty: 0, 
        price: (category.replacement_cost || 0) * 0.05 
      };
    }
    rentalMap[catId].qty++;
  });

  // 2. Calculate Rewash
  const { data: rewashRecords } = await supabase
    .from('rewash_records')
    .select('item_id, linen_items(linen_categories(name, replacement_cost))')
    .eq('client_id', clientId)
    .eq('billable', true)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo);

  const rewashMap: Record<string, { name: string, qty: number, price: number }> = {};
  rewashRecords?.forEach((r: any) => {
    const category = r.linen_items?.linen_categories;
    if (!category) return;
    const name = `${category.name} Rewash Fee`;
    if (!rewashMap[name]) {
      rewashMap[name] = { 
        name, 
        qty: 0, 
        price: (category.replacement_cost || 0) * 0.3 
      };
    }
    rewashMap[name].qty++;
  });

  // 3. Calculate Loss
  const { data: lostItems } = await supabase
    .from('linen_items')
    .select('linen_categories(name, replacement_cost)')
    .eq('client_id', clientId)
    .eq('status', 'lost')
    .gte('last_scan_at', dateFrom)
    .lte('last_scan_at', dateTo);

  const lossMap: Record<string, { name: string, qty: number, price: number }> = {};
  lostItems?.forEach((i: any) => {
    const category = i.linen_categories;
    if (!category) return;
    const name = `${category.name} Loss Replacement`;
    if (!lossMap[name]) {
      lossMap[name] = { 
        name, 
        qty: 0, 
        price: category.replacement_cost || 0 
      };
    }
    lossMap[name].qty++;
  });

  // Merge into breakdown
  const items: BillingBreakdownItem[] = [];
  let subtotal = 0;
  let rewash_total = 0;
  let loss_total = 0;

  Object.values(rentalMap).forEach(m => {
    const amount = m.qty * m.price;
    items.push({ name: m.name, qty: m.qty, unitPrice: m.price, amount, type: 'rental' });
    subtotal += amount;
  });

  Object.values(rewashMap).forEach(m => {
    const amount = m.qty * m.price;
    items.push({ name: m.name, qty: m.qty, unitPrice: m.price, amount, type: 'rewash' });
    subtotal += amount;
    rewash_total += amount;
  });

  Object.values(lossMap).forEach(m => {
    const amount = m.qty * m.price;
    items.push({ name: m.name, qty: m.qty, unitPrice: m.price, amount, type: 'loss' });
    subtotal += amount;
    loss_total += amount;
  });

  const vat = subtotal * 0.07;
  const total = subtotal + vat;

  return {
    client_id: clientId,
    date_from: from,
    date_to: to,
    items,
    subtotal,
    vat,
    total,
    rewash_total,
    loss_total
  };
}
