import type { MetricValues } from '@/components/dashboard/MetricDisplay';
import type { ProductionBatchView } from '@/components/production/ProductionQueueClient';

type DemoCategory = {
  id: string;
  name: string;
  lifespan_cycles: number;
  replacement_cost: number;
};

type DemoClient = {
  id: string;
  name: string;
  address: string;
  active: boolean;
};

type DemoDriver = {
  id: string;
  full_name: string;
};

type DemoInventoryItem = {
  id: string;
  org_id: string;
  rfid_tag_id: string;
  status: string;
  wash_count: number;
  last_scan_at: string;
  last_scan_location: string;
  category_id: string;
  client_id: string | null;
  linen_categories: { name: string; lifespan_cycles: number; replacement_cost?: number };
  clients: { name: string } | null;
};

type DemoOrder = {
  id: string;
  order_number: string;
  scheduled_date: string;
  status: string;
  vehicle_plate: string | null;
  client_id: string;
  driver_id: string | null;
  org_id: string;
};

type DemoOrderLine = {
  id: string;
  order_id: string;
  category_id: string;
  requested_qty: number;
  picked_qty: number;
  returned_qty: number;
};

type DemoInvoice = {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  subtotal: number;
  rewash_charges: number;
  loss_charges: number;
  total: number;
  notes: string;
  clients: { name: string; address: string };
  items_json: Array<{ name: string; qty: number; unitPrice: number; amount: number }>;
};

type DemoRoute = {
  id: string;
  name: string;
  vehicle_plate: string;
  status: string;
  scheduled_at: string;
  profiles: { full_name: string };
  stops: Array<{
    client_name: string;
    address: string;
    estimated_time: string;
    item_count: number;
    status: string;
  }>;
};

type DemoRewashRecord = {
  id: string;
  org_id: string;
  item_id: string;
  client_id: string | null;
  reason: string;
  billable: boolean;
  resolved: boolean;
  created_at: string;
  linen_items: {
    status: string;
    rfid_tag_id: string;
    linen_categories: { name: string; replacement_cost: number };
  };
  clients: { name: string } | null;
};

type DemoClientStat = {
  id: string;
  name: string;
  returnRate: number;
  inCount: number;
  outCount: number;
};

type DemoWashCycleStat = {
  id: string;
  name: string;
  nearEOLCount: number;
  totalCount: number;
  percentage: number;
};

type DemoParAlert = {
  clientName: string;
  categoryName: string;
  parQuantity: number;
  cleanStock: number;
  gap: number;
};

type DemoData = {
  orgId: string;
  categories: DemoCategory[];
  clients: DemoClient[];
  drivers: DemoDriver[];
  inventoryItems: DemoInventoryItem[];
  metrics: MetricValues;
  clientStats: DemoClientStat[];
  washCycleStats: DemoWashCycleStat[];
  orders: DemoOrder[];
  orderLines: DemoOrderLine[];
  productionBatches: ProductionBatchView[];
  routes: DemoRoute[];
  invoices: DemoInvoice[];
  rewashRecords: DemoRewashRecord[];
  parAlerts: DemoParAlert[];
};

const DEMO_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DAY_MS = 24 * 60 * 60 * 1000;

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function buildDemoData(): DemoData {
  const categoryBlueprints = [
    { id: 'cat-bs', name: 'Bed Sheet', lifespan_cycles: 200, replacement_cost: 350 },
    { id: 'cat-dc', name: 'Duvet Cover', lifespan_cycles: 180, replacement_cost: 600 },
    { id: 'cat-btl', name: 'Bath Towel (Large)', lifespan_cycles: 220, replacement_cost: 180 },
    { id: 'cat-bts', name: 'Bath Towel (Small)', lifespan_cycles: 210, replacement_cost: 90 },
    { id: 'cat-pc', name: 'Pillow Case', lifespan_cycles: 230, replacement_cost: 95 },
    { id: 'cat-uf', name: 'Staff Uniform', lifespan_cycles: 150, replacement_cost: 450 },
    { id: 'cat-ap', name: 'Apron', lifespan_cycles: 140, replacement_cost: 120 },
    { id: 'cat-rb', name: 'Bath Robe', lifespan_cycles: 170, replacement_cost: 700 },
    { id: 'cat-mt', name: 'Spa Mat', lifespan_cycles: 160, replacement_cost: 260 },
    { id: 'cat-ct', name: 'Cleaning Towel', lifespan_cycles: 120, replacement_cost: 80 },
  ] satisfies DemoCategory[];

  const clientBlueprints = [
    ['Hilton Pattaya', '333/101 Moo 9, Pattaya Beach Road, Chonburi'],
    ['Royal Cliff Beach Hotel', '353 Phra Tamnak Road, Pattaya, Chonburi'],
    ['Hard Rock Hotel Pattaya', '429 Moo 9, Pattaya Beach Road, Chonburi'],
    ['Centara Grand Mirage', '277-8 Moo 5 Naklua, Pattaya'],
    ['Dusit Thani Pattaya', '240/2 Pattaya Beach Road, Chonburi'],
    ['Amari Pattaya', '240 Pattaya Beach Road, Chonburi'],
    ['Holiday Inn Pattaya', '463/68 Pattaya Sai 1 Road, Chonburi'],
    ['Siam Bayshore Resort', '559 Moo 10, Pattaya Beach Road, Chonburi'],
    ['Pullman Pattaya Hotel G', '445/3 Wong Amat Beach, Chonburi'],
    ['Movenpick Siam Na Jomtien', '55 Moo 2 Sukhumvit Road, Sattahip'],
    ['Grande Centre Point Space', '888 Pattaya 3rd Road, Chonburi'],
    ['Cape Dara Resort', '256 Dara Beach, Pattaya-Naklua Road'],
  ].map(([name, address], index) => ({
    id: `client-${index + 1}`,
    name,
    address,
    active: true,
  })) satisfies DemoClient[];

  const driverBlueprints = ['Somchai Driver', 'Anan Driver', 'Niran Driver', 'Preecha Driver', 'Krit Driver', 'Thanawat Driver']
    .map((full_name, index) => ({
      id: `driver-${index + 1}`,
      full_name,
    })) satisfies DemoDriver[];

  const inventoryItems: DemoInventoryItem[] = [];
  const statusCounts: Record<string, number> = {
    clean: 0,
    out: 0,
    dirty: 0,
    washing: 0,
    drying: 0,
    folding: 0,
    rewash: 0,
    lost: 0,
    rejected: 0,
  };

  for (let index = 0; index < 10000; index += 1) {
    const category = categoryBlueprints[index % categoryBlueprints.length];
    const client = clientBlueprints[index % clientBlueprints.length];
    const bucket = index % 100;
    let status = 'clean';
    if (bucket >= 42 && bucket < 70) status = 'out';
    else if (bucket < 82) status = 'dirty';
    else if (bucket < 88) status = 'washing';
    else if (bucket < 92) status = 'drying';
    else if (bucket < 95) status = 'folding';
    else if (bucket < 98) status = 'rewash';
    else if (bucket < 99) status = 'lost';
    else status = 'rejected';

    statusCounts[status] += 1;

    const cycleRatio = ((index * 17) % 100) / 100;
    const washCount = Math.min(
      category.lifespan_cycles - 2,
      Math.max(6, Math.floor(category.lifespan_cycles * (0.18 + cycleRatio * 0.78)))
    );
    const lastScanOffsetHours = (index % 240) * 0.8 + 1;
    const locations = ['Gate A', 'Gate B', 'Laundry Hub', 'Delivery Van 1', 'Delivery Van 2', 'QC Station', 'Dryer 3'];

    inventoryItems.push({
      id: `item-${index + 1}`,
      org_id: DEMO_ORG_ID,
      rfid_tag_id: `TG-${category.id.replace('cat-', '').toUpperCase()}-${String(index + 1).padStart(6, '0')}`,
      status,
      wash_count: washCount,
      last_scan_at: hoursAgo(lastScanOffsetHours),
      last_scan_location: locations[index % locations.length],
      category_id: category.id,
      client_id: status === 'clean' ? null : client.id,
      linen_categories: {
        name: category.name,
        lifespan_cycles: category.lifespan_cycles,
        replacement_cost: category.replacement_cost,
      },
      clients: status === 'clean' ? null : { name: client.name },
    });
  }

  const metrics: MetricValues = {
    cleanReady: statusCounts.clean,
    outWithClients: statusCounts.out,
    inProduction: statusCounts.dirty + statusCounts.washing + statusCounts.drying + statusCounts.folding,
    inRewash: statusCounts.rewash,
    lostMonth: statusCounts.lost,
  };

  const clientStats = clientBlueprints.map((client, index) => {
    const outCount = 180 + ((index * 29) % 140);
    const inCount = Math.max(0, outCount - (index % 4 === 0 ? 6 : index % 3 === 0 ? 14 : 3));
    return {
      id: client.id,
      name: client.name,
      returnRate: outCount > 0 ? Math.round((inCount / outCount) * 100) : 0,
      inCount,
      outCount,
    };
  });

  const washCycleStats = categoryBlueprints.map((category) => {
    const rows = inventoryItems.filter((item) => item.category_id === category.id);
    const nearEOLCount = rows.filter((item) => item.wash_count >= Math.floor(category.lifespan_cycles * 0.8)).length;
    return {
      id: category.id,
      name: category.name,
      nearEOLCount,
      totalCount: rows.length,
      percentage: rows.length ? Math.round((nearEOLCount / rows.length) * 100) : 0,
    };
  });

  const today = new Date();
  const orders: DemoOrder[] = Array.from({ length: 24 }).map((_, index) => {
    const client = clientBlueprints[index % clientBlueprints.length];
    const driver = driverBlueprints[index % driverBlueprints.length];
    const statusCycle = ['draft', 'picking', 'ready', 'dispatched', 'completed'];
    const status = statusCycle[index % statusCycle.length];
    const scheduled = new Date(today.getTime() + ((index % 6) - 1) * DAY_MS);
    return {
      id: `order-${index + 1}`,
      order_number: `DO-${String(2401 + index).padStart(4, '0')}`,
      scheduled_date: scheduled.toISOString().slice(0, 10),
      status,
      vehicle_plate: `${(index % 9) + 1}กข-${String(1450 + index).padStart(4, '0')}`,
      client_id: client.id,
      driver_id: status === 'draft' ? null : driver.id,
      org_id: DEMO_ORG_ID,
    };
  });

  const orderLines: DemoOrderLine[] = [];
  orders.forEach((order, orderIndex) => {
    for (let lineIndex = 0; lineIndex < 3; lineIndex += 1) {
      const category = categoryBlueprints[(orderIndex + lineIndex) % categoryBlueprints.length];
      const requested = 40 + ((orderIndex * 17 + lineIndex * 9) % 70);
      const statusFactor = order.status === 'completed' || order.status === 'dispatched'
        ? 1
        : order.status === 'ready'
          ? 1
          : order.status === 'picking'
            ? 0.62
            : 0;
      const picked = Math.floor(requested * statusFactor);
      const returned = order.status === 'completed' ? Math.floor(picked * 0.94) : 0;
      orderLines.push({
        id: `line-${order.id}-${lineIndex + 1}`,
        order_id: order.id,
        category_id: category.id,
        requested_qty: requested,
        picked_qty: picked,
        returned_qty: returned,
      });
    }
  });

  const productionBatches: ProductionBatchView[] = [
    { id: 'pb-1', inbound_batch_id: 'ib-1', status: 'queued', client_name: clientBlueprints[0].name, item_count: 180, waiting_hours: 2.4, wash_started_at: null, dry_started_at: null, fold_started_at: null },
    { id: 'pb-2', inbound_batch_id: 'ib-2', status: 'queued', client_name: clientBlueprints[3].name, item_count: 126, waiting_hours: 1.8, wash_started_at: null, dry_started_at: null, fold_started_at: null },
    { id: 'pb-3', inbound_batch_id: 'ib-3', status: 'washing', client_name: clientBlueprints[1].name, item_count: 98, waiting_hours: 0.7, wash_started_at: hoursAgo(0.5), dry_started_at: null, fold_started_at: null },
    { id: 'pb-4', inbound_batch_id: 'ib-4', status: 'washing', client_name: clientBlueprints[5].name, item_count: 86, waiting_hours: 0.5, wash_started_at: hoursAgo(0.4), dry_started_at: null, fold_started_at: null },
    { id: 'pb-5', inbound_batch_id: 'ib-5', status: 'drying', client_name: clientBlueprints[2].name, item_count: 74, waiting_hours: 1.1, wash_started_at: hoursAgo(1.4), dry_started_at: hoursAgo(0.6), fold_started_at: null },
    { id: 'pb-6', inbound_batch_id: 'ib-6', status: 'folding', client_name: clientBlueprints[7].name, item_count: 54, waiting_hours: 0.9, wash_started_at: hoursAgo(1.8), dry_started_at: hoursAgo(1.0), fold_started_at: hoursAgo(0.3) },
  ];

  const routes: DemoRoute[] = Array.from({ length: 6 }).map((_, index) => {
    const driver = driverBlueprints[index % driverBlueprints.length];
    const routeStops = Array.from({ length: 4 }).map((__, stopIndex) => {
      const client = clientBlueprints[(index * 2 + stopIndex) % clientBlueprints.length];
      const status = index === 0
        ? stopIndex < 3 ? 'delivered' : 'pending'
        : index === 1
          ? stopIndex < 2 ? 'delivered' : 'pending'
          : index === 2
            ? stopIndex === 0 ? 'delivered' : 'pending'
            : 'pending';
      return {
        client_name: client.name,
        address: client.address,
        estimated_time: `${String(9 + stopIndex).padStart(2, '0')}:${stopIndex % 2 === 0 ? '00' : '30'}`,
        item_count: 45 + ((index + stopIndex) * 11),
        status,
      };
    });
    return {
      id: `route-${index + 1}`,
      name: `Route ${String.fromCharCode(65 + index)}`,
      vehicle_plate: `${(index % 9) + 1}กข-${String(3200 + index).padStart(4, '0')}`,
      status: index === 0 || index === 1 ? 'active' : index === 2 ? 'completed' : 'pending',
      scheduled_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8 + index, 0, 0).toISOString(),
      profiles: { full_name: driver.full_name },
      stops: routeStops,
    };
  });

  const invoices: DemoInvoice[] = clientBlueprints.slice(0, 8).map((client, index) => {
    const subtotal = 42000 + index * 3800;
    const rewash = index % 3 === 0 ? 1800 : index % 3 === 1 ? 900 : 0;
    const losses = index % 4 === 0 ? 1200 : 0;
    return {
      id: `inv-${index + 1}`,
      invoice_number: `INV-2026-${String(index + 1).padStart(4, '0')}`,
      issue_date: new Date(Date.now() - (index + 3) * DAY_MS).toISOString(),
      due_date: new Date(Date.now() + (12 - index) * DAY_MS).toISOString(),
      status: index % 4 === 0 ? 'paid' : index % 4 === 1 ? 'pending' : index % 4 === 2 ? 'draft' : 'overdue',
      subtotal,
      rewash_charges: rewash,
      loss_charges: losses,
      total: subtotal + rewash + losses,
      notes: `Auto-generated demo invoice for ${client.name}.`,
      clients: { name: client.name, address: client.address },
      items_json: [
        { name: 'Laundry service volume', qty: 450 + index * 12, unitPrice: 85, amount: subtotal - rewash - losses },
        { name: 'Rewash surcharge', qty: Math.max(0, Math.floor(rewash / 150)), unitPrice: 150, amount: rewash },
        { name: 'Loss replacement', qty: Math.max(0, Math.floor(losses / 300)), unitPrice: 300, amount: losses },
      ].filter((row) => row.amount > 0),
    };
  });

  const rewashRecords: DemoRewashRecord[] = inventoryItems
    .filter((item) => item.status === 'rewash' || item.status === 'rejected')
    .slice(0, 120)
    .map((item, index) => ({
      id: `rewash-${index + 1}`,
      org_id: DEMO_ORG_ID,
      item_id: item.id,
      client_id: item.client_id,
      reason: index % 3 === 0 ? 'stain' : index % 3 === 1 ? 'damage' : 'special_treatment',
      billable: index % 4 !== 0,
      resolved: index >= 42,
      created_at: new Date(Date.now() - (index + 1) * 9 * 60 * 60 * 1000).toISOString(),
      linen_items: {
        status: item.status === 'rejected' || index % 6 === 0 ? 'rejected' : 'clean',
        rfid_tag_id: item.rfid_tag_id,
        linen_categories: {
          name: item.linen_categories.name,
          replacement_cost: item.linen_categories.replacement_cost || 0,
        },
      },
      clients: item.clients,
    }));

  const cleanByCategory = new Map<string, number>();
  inventoryItems
    .filter((item) => item.status === 'clean')
    .forEach((item) => cleanByCategory.set(item.category_id, (cleanByCategory.get(item.category_id) || 0) + 1));

  const parAlerts = clientBlueprints.slice(0, 6).map((client, index) => {
    const category = categoryBlueprints[index % categoryBlueprints.length];
    const parQuantity = 180 + index * 18;
    const cleanStock = cleanByCategory.get(category.id) || 0;
    return {
      clientName: client.name,
      categoryName: category.name,
      parQuantity,
      cleanStock,
      gap: Math.max(0, parQuantity - cleanStock),
    };
  }).filter((row) => row.gap > 0).slice(0, 8);

  return {
    orgId: DEMO_ORG_ID,
    categories: categoryBlueprints,
    clients: clientBlueprints,
    drivers: driverBlueprints,
    inventoryItems,
    metrics,
    clientStats,
    washCycleStats,
    orders,
    orderLines,
    productionBatches,
    routes,
    invoices,
    rewashRecords,
    parAlerts,
  };
}

let cache: DemoData | null = null;

export function getDemoData(): DemoData {
  if (!cache) {
    cache = buildDemoData();
  }
  return cache;
}

export function getDemoInventoryView(params: {
  q?: string;
  status?: string;
  categoryId?: string;
  clientId?: string;
  cycle?: string;
  page?: number;
  pageSize?: number;
}) {
  const data = getDemoData();
  const {
    q = '',
    status = 'all',
    categoryId = 'all',
    clientId = 'all',
    cycle = 'all',
    page = 1,
    pageSize = 50,
  } = params;

  let rows = data.inventoryItems;
  if (q) rows = rows.filter((item) => item.rfid_tag_id.toLowerCase().includes(q.toLowerCase()));
  if (status !== 'all') rows = rows.filter((item) => item.status === status);
  if (categoryId !== 'all') rows = rows.filter((item) => item.category_id === categoryId);
  if (clientId !== 'all') rows = rows.filter((item) => item.client_id === clientId);
  if (cycle === 'normal') rows = rows.filter((item) => item.wash_count < 160);
  if (cycle === 'near_eol') rows = rows.filter((item) => item.wash_count >= 160 && item.wash_count < 180);
  if (cycle === 'critical') rows = rows.filter((item) => item.wash_count >= 180);

  const from = (page - 1) * pageSize;
  return {
    categories: data.categories.map((category) => ({ id: category.id, name: category.name })),
    clients: data.clients.map((client) => ({ id: client.id, name: client.name })),
    totalItems: data.inventoryItems.length,
    inStock: data.inventoryItems.filter((item) => item.status === 'clean').length,
    outItems: data.inventoryItems.filter((item) => item.status === 'out').length,
    nearEol: data.inventoryItems.filter((item) => item.wash_count >= 160).length,
    items: rows.slice(from, from + pageSize),
    filteredCount: rows.length,
  };
}

export function getDemoOrderDetail(id: string) {
  const data = getDemoData();
  const order = data.orders.find((row) => row.id === id);
  if (!order) return null;
  const client = data.clients.find((row) => row.id === order.client_id) || null;
  const driver = data.drivers.find((row) => row.id === order.driver_id) || null;
  const lines = data.orderLines
    .filter((row) => row.order_id === id)
    .map((row) => {
      const category = data.categories.find((item) => item.id === row.category_id);
      return {
        category_id: row.category_id,
        category_name: category?.name || row.category_id,
        requested: row.requested_qty,
        picked: row.picked_qty,
        returned: row.returned_qty,
      };
    });

  return {
    order,
    client,
    driver,
    lines,
  };
}

export function getDemoItemDetail(id: string) {
  const data = getDemoData();
  const item = data.inventoryItems.find((row) => row.id === id);
  if (!item) return null;

  const lifeCycles = item.linen_categories?.lifespan_cycles || 200;
  const checkpoints = [
    { event_type: 'checkin', gate_id: 'gate_a', hoursAgo: 2, source: 'rfid_gate', clientName: null },
    { event_type: 'wash_done', gate_id: 'washer_2', hoursAgo: 14, source: 'production', clientName: null },
    { event_type: 'checkin', gate_id: 'gate_b', hoursAgo: 36, source: 'return_scan', clientName: item.clients?.name || null },
    { event_type: 'checkout', gate_id: 'dispatch_lane', hoursAgo: 66, source: 'dispatch', clientName: item.clients?.name || null },
    { event_type: 'audit', gate_id: 'cycle_count', hoursAgo: 120, source: 'audit_bot', clientName: item.clients?.name || null },
  ];

  const events = checkpoints.map((entry, index) => ({
    id: `${item.id}-event-${index + 1}`,
    created_at: new Date(Date.now() - entry.hoursAgo * 60 * 60 * 1000).toISOString(),
    event_type: entry.event_type,
    gate_id: entry.gate_id,
    source: entry.source,
    clients: entry.clientName ? { name: entry.clientName } : null,
  }));

  return {
    item: {
      ...item,
      linen_categories: {
        ...item.linen_categories,
        lifespan_cycles: lifeCycles,
      },
    },
    events,
  };
}
