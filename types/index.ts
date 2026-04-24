// Literal Types (Enums)
export type RoleType = 'admin' | 'manager' | 'staff' | 'driver';
export type LinenStatus =
  | 'clean'
  | 'out'
  | 'dirty'
  | 'washing'
  | 'drying'
  | 'folding'
  | 'rewash'
  | 'rejected'
  | 'lost';
export type ScanEventType =
  | 'checkout'
  | 'dispatch'
  | 'checkin'
  | 'qc_pass'
  | 'qc_rewash'
  | 'qc_reject'
  | 'wash_start'
  | 'wash_done'
  | 'dry_done'
  | 'audit'
  | 'rewash'
  | 'reject'
  | 'found';
export type BatchType = 'outbound' | 'inbound';
export type RouteStatus = 'pending' | 'active' | 'completed';
export type RewashReason = 'stain' | 'damage' | 'special_treatment' | 'other';
export type DeliveryOrderStatus =
  | 'draft'
  | 'picking'
  | 'ready'
  | 'dispatched'
  | 'completed'
  | 'cancelled';
export type SessionType = 'picking' | 'return';

// Tables

export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface Profile {
  id: string;
  org_id: string;
  full_name: string | null;
  role: RoleType;
  created_at: string;
}

export interface Client {
  id: string;
  org_id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  active: boolean;
  created_at: string;
}

export interface LinenCategory {
  id: string;
  org_id: string;
  name: string;
  lifespan_cycles: number;
  replacement_cost: number | null;
  created_at: string;
}

export interface LinenItem {
  id: string;
  org_id: string;
  rfid_tag_id: string;
  category_id: string | null;
  client_id: string | null;
  status: LinenStatus;
  current_batch_id?: string | null;
  wash_count: number;
  last_scan_at: string | null;
  last_scan_location: string | null;
  created_at: string;
}

export interface ScanEvent {
  id: string;
  org_id: string;
  rfid_tag_id: string;
  item_id: string | null;
  event_type: ScanEventType;
  order_id?: string | null;
  client_id: string | null;
  gate_id: string | null;
  batch_id: string | null;
  source: string | null;
  weight_kg?: number | null;
  scanned_by: string | null;
  created_at: string;
  linen_items?: { rfid_tag_id: string } | null;
  clients?: { name: string } | null;
}

export interface Route {
  id: string;
  org_id: string;
  name: string;
  driver_id: string | null;
  vehicle_plate: string | null;
  status: RouteStatus;
  scheduled_at: string | null;
  stops: Array<Record<string, unknown>>;
  created_at: string;
}

export interface DeliveryBatch {
  id: string;
  org_id: string;
  client_id: string;
  batch_type: BatchType;
  order_id?: string | null;
  route_id: string | null;
  status?: 'open' | 'picking' | 'dispatched' | 'closed';
  total_items: number;
  returned_items: number;
  manifest_signed: boolean;
  signed_by: string | null;
  driver_id: string | null;
  weight_kg?: number | null;
  returned_at?: string | null;
  dispatched_at?: string | null;
  created_at: string;
}

export interface RewashRecord {
  id: string;
  org_id: string;
  item_id: string;
  client_id: string | null;
  reason: RewashReason;
  billable: boolean;
  resolved: boolean;
  created_at: string;
}

export interface DeliveryOrder {
  id: string;
  org_id: string;
  order_number: string;
  client_id: string;
  driver_id: string | null;
  vehicle_plate: string | null;
  scheduled_date: string;
  status: DeliveryOrderStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
}

export interface DeliveryOrderItem {
  id: string;
  order_id: string;
  category_id: string;
  requested_qty: number;
  picked_qty: number;
  returned_qty: number;
}

export interface ActiveSession {
  id: string;
  org_id: string;
  order_id: string;
  batch_id: string;
  session_type: SessionType;
  gate_id: string | null;
  started_by: string | null;
  started_at: string;
  last_activity_at: string;
  is_active: boolean;
  items_scanned: number;
}
