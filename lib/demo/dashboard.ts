import type { MetricValues } from '@/components/dashboard/MetricDisplay';
import { ScanEvent } from '@/types';

const now = Date.now();

export const DEMO_METRICS: MetricValues = {
  cleanReady: 284,
  outWithClients: 136,
  inProduction: 48,
  inRewash: 12,
  lostMonth: 3,
};

export type DemoClientStat = {
  id: string;
  name: string;
  returnRate: number;
  inCount: number;
  outCount: number;
};

export const DEMO_CLIENT_STATS: DemoClientStat[] = [
  { id: 'client-1', name: 'Hilton Pattaya', returnRate: 98, inCount: 196, outCount: 200 },
  { id: 'client-2', name: 'Royal Cliff Beach Hotel', returnRate: 95, inCount: 171, outCount: 180 },
  { id: 'client-3', name: 'Hard Rock Hotel Pattaya', returnRate: 92, inCount: 138, outCount: 150 },
  { id: 'client-4', name: 'Centara Grand Mirage', returnRate: 97, inCount: 145, outCount: 149 },
  { id: 'client-5', name: 'Dusit Thani Pattaya', returnRate: 89, inCount: 98, outCount: 110 },
];

export type DemoWashCycleStat = {
  id: string;
  name: string;
  nearEOLCount: number;
  totalCount: number;
  percentage: number;
};

export const DEMO_WASH_CYCLE_STATS: DemoWashCycleStat[] = [
  { id: 'cat-1', name: 'Bed Sheet', nearEOLCount: 14, totalCount: 150, percentage: 9 },
  { id: 'cat-2', name: 'Bath Towel (Large)', nearEOLCount: 21, totalCount: 100, percentage: 21 },
  { id: 'cat-3', name: 'Bath Towel (Small)', nearEOLCount: 9, totalCount: 80, percentage: 11 },
  { id: 'cat-4', name: 'Staff Uniform', nearEOLCount: 17, totalCount: 80, percentage: 21 },
];

export type DemoRouteStop = {
  id: string;
  stop_no: number;
  status: string;
  client_name: string;
  delivered_at: string | null;
  driver_name: string;
};

export const DEMO_ROUTE_STOPS: DemoRouteStop[] = [
  { id: 'stop-1', stop_no: 1, status: 'completed', client_name: 'Hilton Pattaya', delivered_at: new Date(now - 1000 * 60 * 45).toISOString(), driver_name: 'Somchai' },
  { id: 'stop-2', stop_no: 2, status: 'completed', client_name: 'Royal Cliff Beach Hotel', delivered_at: new Date(now - 1000 * 60 * 18).toISOString(), driver_name: 'Somchai' },
  { id: 'stop-3', stop_no: 3, status: 'active', client_name: 'Hard Rock Hotel Pattaya', delivered_at: null, driver_name: 'Anan' },
  { id: 'stop-4', stop_no: 4, status: 'pending', client_name: 'Centara Grand Mirage', delivered_at: null, driver_name: 'Anan' },
  { id: 'stop-5', stop_no: 5, status: 'pending', client_name: 'Dusit Thani Pattaya', delivered_at: null, driver_name: 'Niran' },
];

export const DEMO_SCAN_EVENTS: ScanEvent[] = [
  {
    id: 'scan-1',
    org_id: 'demo-org',
    rfid_tag_id: 'TG-BS-000184',
    item_id: 'item-1',
    event_type: 'checkout',
    client_id: 'client-1',
    gate_id: 'gate_a',
    batch_id: null,
    source: 'simulator',
    scanned_by: null,
    created_at: new Date(now - 1000 * 60 * 4).toISOString(),
    clients: { name: 'Hilton Pattaya' },
  },
  {
    id: 'scan-2',
    org_id: 'demo-org',
    rfid_tag_id: 'TG-BT-000072',
    item_id: 'item-2',
    event_type: 'checkin',
    client_id: 'client-2',
    gate_id: 'gate_b',
    batch_id: null,
    source: 'simulator',
    scanned_by: null,
    created_at: new Date(now - 1000 * 60 * 9).toISOString(),
    clients: { name: 'Royal Cliff Beach Hotel' },
  },
  {
    id: 'scan-3',
    org_id: 'demo-org',
    rfid_tag_id: 'TG-UF-000019',
    item_id: 'item-3',
    event_type: 'rewash',
    client_id: 'client-3',
    gate_id: 'handheld_1',
    batch_id: null,
    source: 'simulator',
    scanned_by: null,
    created_at: new Date(now - 1000 * 60 * 15).toISOString(),
    clients: { name: 'Hard Rock Hotel Pattaya' },
  },
  {
    id: 'scan-4',
    org_id: 'demo-org',
    rfid_tag_id: 'TG-DC-000031',
    item_id: 'item-4',
    event_type: 'checkout',
    client_id: 'client-4',
    gate_id: 'gate_a',
    batch_id: null,
    source: 'simulator',
    scanned_by: null,
    created_at: new Date(now - 1000 * 60 * 23).toISOString(),
    clients: { name: 'Centara Grand Mirage' },
  },
  {
    id: 'scan-5',
    org_id: 'demo-org',
    rfid_tag_id: 'TG-AP-000011',
    item_id: 'item-5',
    event_type: 'checkin',
    client_id: 'client-5',
    gate_id: 'gate_b',
    batch_id: null,
    source: 'simulator',
    scanned_by: null,
    created_at: new Date(now - 1000 * 60 * 31).toISOString(),
    clients: { name: 'Dusit Thani Pattaya' },
  },
];

export type DemoParAlert = {
  clientName: string;
  categoryName: string;
  parQuantity: number;
  cleanStock: number;
  gap: number;
};

export const DEMO_PAR_ALERTS: DemoParAlert[] = [
  { clientName: 'Hilton Pattaya', categoryName: 'Bed Sheet', parQuantity: 120, cleanStock: 86, gap: 34 },
  { clientName: 'Royal Cliff Beach Hotel', categoryName: 'Bath Towel (Large)', parQuantity: 90, cleanStock: 61, gap: 29 },
  { clientName: 'Hard Rock Hotel Pattaya', categoryName: 'Duvet Cover', parQuantity: 70, cleanStock: 48, gap: 22 },
];

export const DEMO_ORG_ID = '00000000-0000-0000-0000-000000000001';

export const DEMO_CATEGORIES = [
  { id: 'cat-bs', name: 'Bed Sheet' },
  { id: 'cat-bt', name: 'Bath Towel (Large)' },
  { id: 'cat-st', name: 'Bath Towel (Small)' },
  { id: 'cat-uf', name: 'Staff Uniform' },
];

export const DEMO_CLIENTS = [
  { id: 'client-1', name: 'Hilton Pattaya' },
  { id: 'client-2', name: 'Royal Cliff Beach Hotel' },
  { id: 'client-3', name: 'Hard Rock Hotel Pattaya' },
  { id: 'client-4', name: 'Centara Grand Mirage' },
];

export const DEMO_INVENTORY_ITEMS = [
  {
    id: 'item-1',
    rfid_tag_id: 'TG-BS-000184',
    status: 'clean',
    wash_count: 88,
    last_scan_at: new Date(now - 1000 * 60 * 12).toISOString(),
    last_scan_location: 'Gate A',
    linen_categories: { name: 'Bed Sheet', lifespan_cycles: 200 },
    clients: null,
  },
  {
    id: 'item-2',
    rfid_tag_id: 'TG-BT-000072',
    status: 'out',
    wash_count: 121,
    last_scan_at: new Date(now - 1000 * 60 * 42).toISOString(),
    last_scan_location: 'Delivery Van 2',
    linen_categories: { name: 'Bath Towel (Large)', lifespan_cycles: 220 },
    clients: { name: 'Royal Cliff Beach Hotel' },
  },
  {
    id: 'item-3',
    rfid_tag_id: 'TG-UF-000019',
    status: 'rewash',
    wash_count: 167,
    last_scan_at: new Date(now - 1000 * 60 * 73).toISOString(),
    last_scan_location: 'QC Station',
    linen_categories: { name: 'Staff Uniform', lifespan_cycles: 150 },
    clients: { name: 'Hard Rock Hotel Pattaya' },
  },
  {
    id: 'item-4',
    rfid_tag_id: 'TG-ST-000044',
    status: 'drying',
    wash_count: 54,
    last_scan_at: new Date(now - 1000 * 60 * 19).toISOString(),
    last_scan_location: 'Dryer 3',
    linen_categories: { name: 'Bath Towel (Small)', lifespan_cycles: 200 },
    clients: { name: 'Centara Grand Mirage' },
  },
  {
    id: 'item-5',
    rfid_tag_id: 'TG-BS-000211',
    status: 'lost',
    wash_count: 186,
    last_scan_at: new Date(now - 1000 * 60 * 60 * 28).toISOString(),
    last_scan_location: 'Client Site Audit',
    linen_categories: { name: 'Bed Sheet', lifespan_cycles: 200 },
    clients: { name: 'Hilton Pattaya' },
  },
  {
    id: 'item-6',
    rfid_tag_id: 'TG-BT-000155',
    status: 'clean',
    wash_count: 143,
    last_scan_at: new Date(now - 1000 * 60 * 6).toISOString(),
    last_scan_location: 'Gate B',
    linen_categories: { name: 'Bath Towel (Large)', lifespan_cycles: 220 },
    clients: null,
  },
];

export const DEMO_ORDER_CLIENTS = [
  { id: 'client-1', name: 'Hilton Pattaya' },
  { id: 'client-2', name: 'Royal Cliff Beach Hotel' },
  { id: 'client-3', name: 'Hard Rock Hotel Pattaya' },
];

export const DEMO_ORDER_DRIVERS = [
  { id: 'driver-1', full_name: 'Somchai Driver' },
  { id: 'driver-2', full_name: 'Anan Driver' },
];

export const DEMO_ORDERS = [
  { id: 'order-1', order_number: 'DO-2401', scheduled_date: '2026-04-24', status: 'picking', vehicle_plate: '2กข-1456', client_id: 'client-1', driver_id: 'driver-1' },
  { id: 'order-2', order_number: 'DO-2402', scheduled_date: '2026-04-24', status: 'ready', vehicle_plate: '3กข-2251', client_id: 'client-2', driver_id: 'driver-2' },
  { id: 'order-3', order_number: 'DO-2403', scheduled_date: '2026-04-25', status: 'dispatched', vehicle_plate: '7กข-5178', client_id: 'client-3', driver_id: 'driver-1' },
  { id: 'order-4', order_number: 'DO-2404', scheduled_date: '2026-04-25', status: 'draft', vehicle_plate: '5กข-8881', client_id: 'client-1', driver_id: null },
];

export const DEMO_ORDER_LINES = [
  { order_id: 'order-1', requested_qty: 80, picked_qty: 46 },
  { order_id: 'order-1', requested_qty: 30, picked_qty: 12 },
  { order_id: 'order-2', requested_qty: 120, picked_qty: 120 },
  { order_id: 'order-3', requested_qty: 64, picked_qty: 64 },
  { order_id: 'order-4', requested_qty: 90, picked_qty: 0 },
];

export const DEMO_PRODUCTION_BATCHES = [
  { id: 'pb-1', inbound_batch_id: 'ib-1', status: 'queued', client_name: 'Hilton Pattaya', item_count: 84, waiting_hours: 1.8, wash_started_at: null, dry_started_at: null, fold_started_at: null },
  { id: 'pb-2', inbound_batch_id: 'ib-2', status: 'washing', client_name: 'Royal Cliff Beach Hotel', item_count: 62, waiting_hours: 0.6, wash_started_at: new Date(now - 1000 * 60 * 25).toISOString(), dry_started_at: null, fold_started_at: null },
  { id: 'pb-3', inbound_batch_id: 'ib-3', status: 'drying', client_name: 'Hard Rock Hotel Pattaya', item_count: 41, waiting_hours: 0.9, wash_started_at: new Date(now - 1000 * 60 * 70).toISOString(), dry_started_at: new Date(now - 1000 * 60 * 18).toISOString(), fold_started_at: null },
  { id: 'pb-4', inbound_batch_id: 'ib-4', status: 'folding', client_name: 'Centara Grand Mirage', item_count: 28, waiting_hours: 1.1, wash_started_at: new Date(now - 1000 * 60 * 110).toISOString(), dry_started_at: new Date(now - 1000 * 60 * 52).toISOString(), fold_started_at: new Date(now - 1000 * 60 * 14).toISOString() },
];

export const DEMO_ACTIVE_SESSION = {
  id: 'session-1',
  order_id: 'order-1',
  order_number: 'DO-2401',
};

export const DEMO_INVOICES = [
  {
    id: 'inv-1',
    invoice_number: 'INV-2026-0001',
    issue_date: '2026-04-10T00:00:00.000Z',
    due_date: '2026-05-10T00:00:00.000Z',
    status: 'pending',
    subtotal: 24500,
    rewash_charges: 1200,
    loss_charges: 0,
    total: 25700,
    notes: 'Monthly service billing for April operations.',
    clients: {
      name: 'Hilton Pattaya',
      address: '333/101 Moo 9, Pattaya Beach Road, Chonburi',
    },
    items_json: [
      { name: 'Laundry service volume', qty: 350, unitPrice: 60, amount: 21000 },
      { name: 'Rewash surcharge', qty: 12, unitPrice: 100, amount: 1200 },
      { name: 'Express turnaround', qty: 10, unitPrice: 230, amount: 2300 },
    ],
  },
  {
    id: 'inv-2',
    invoice_number: 'INV-2026-0002',
    issue_date: '2026-04-08T00:00:00.000Z',
    due_date: '2026-04-22T00:00:00.000Z',
    status: 'paid',
    subtotal: 18900,
    rewash_charges: 0,
    loss_charges: 600,
    total: 19500,
    notes: 'Paid via bank transfer.',
    clients: {
      name: 'Royal Cliff Beach Hotel',
      address: '353 Phra Tamnak Road, Pattaya, Chonburi',
    },
    items_json: [
      { name: 'Weekly linen handling', qty: 270, unitPrice: 70, amount: 18900 },
      { name: 'Loss adjustment', qty: 2, unitPrice: 300, amount: 600 },
    ],
  },
  {
    id: 'inv-3',
    invoice_number: 'INV-2026-0003',
    issue_date: '2026-04-15T00:00:00.000Z',
    due_date: '2026-04-29T00:00:00.000Z',
    status: 'draft',
    subtotal: 31200,
    rewash_charges: 1800,
    loss_charges: 900,
    total: 33900,
    notes: 'Awaiting manager review before sending.',
    clients: {
      name: 'Hard Rock Hotel Pattaya',
      address: '429 Moo 9, Pattaya Beach Road, Chonburi',
    },
    items_json: [
      { name: 'Bulk laundry processing', qty: 480, unitPrice: 65, amount: 31200 },
      { name: 'Rewash cases', qty: 18, unitPrice: 100, amount: 1800 },
      { name: 'Damaged item replacement', qty: 3, unitPrice: 300, amount: 900 },
    ],
  },
];
