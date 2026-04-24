import type { LinenStatus } from './status-machine';

export interface PickingItem {
  status: LinenStatus;
  current_batch_id: string | null;
}

export interface DeliveryOrderCategoryLine {
  category_id: string;
  category_name: string;
  requested_qty: number;
  picked_qty: number;
}

export interface DeliveryOrderLike {
  items: DeliveryOrderCategoryLine[];
}

export function validatePickingEligibility(item: PickingItem): {
  eligible: boolean;
  reason?: string;
} {
  if (item.status !== 'clean') {
    return { eligible: false, reason: `item_status_not_clean:${item.status}` };
  }

  if (item.current_batch_id !== null) {
    return { eligible: false, reason: 'item_already_in_batch' };
  }

  return { eligible: true };
}

export function validateCategoryMatch(
  item: { category_id: string },
  order: DeliveryOrderLike
): { match: boolean; category_name: string } {
  const line = order.items.find((entry) => entry.category_id === item.category_id);

  if (!line) {
    return { match: false, category_name: '' };
  }

  return { match: true, category_name: line.category_name };
}

export function validateBatchCapacity(
  _batch_id: string,
  order: DeliveryOrderLike
): {
  canAdd: boolean;
  remaining: Record<string, number>;
} {
  const remaining: Record<string, number> = {};

  for (const line of order.items) {
    const qtyRemaining = Math.max(line.requested_qty - line.picked_qty, 0);
    remaining[line.category_id] = qtyRemaining;
  }

  const canAdd = Object.values(remaining).some((qty) => qty > 0);
  return { canAdd, remaining };
}
