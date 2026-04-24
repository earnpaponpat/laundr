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

type TransitionTarget = LinenStatus | 'same';

export const TRANSITION_MAP: Record<
  ScanEventType,
  {
    from: LinenStatus[];
    to: TransitionTarget;
  }
> = {
  checkout: { from: ['clean'], to: 'same' },
  dispatch: { from: ['clean'], to: 'out' },
  checkin: { from: ['out'], to: 'dirty' },
  qc_pass: { from: ['folding'], to: 'clean' },
  qc_rewash: { from: ['folding'], to: 'rewash' },
  qc_reject: { from: ['folding', 'rewash'], to: 'rejected' },
  wash_start: { from: ['dirty', 'rewash'], to: 'washing' },
  wash_done: { from: ['washing'], to: 'drying' },
  dry_done: { from: ['drying'], to: 'folding' },
  rewash: { from: ['clean', 'out'], to: 'rewash' },
  reject: { from: ['clean', 'out'], to: 'rejected' },
  found: { from: ['lost'], to: 'dirty' },
  audit: {
    from: ['clean', 'out', 'dirty', 'washing', 'drying', 'folding', 'rewash'],
    to: 'same',
  },
};

export function canTransition(currentStatus: LinenStatus, event: ScanEventType): boolean {
  const rule = TRANSITION_MAP[event];
  return rule.from.includes(currentStatus);
}

export function getNewStatus(currentStatus: LinenStatus, event: ScanEventType): LinenStatus | null {
  const rule = TRANSITION_MAP[event];
  if (!rule.from.includes(currentStatus)) {
    return null;
  }

  return rule.to === 'same' ? currentStatus : rule.to;
}

export function validateTransition(
  currentStatus: LinenStatus,
  event: ScanEventType
): { valid: boolean; error?: string } {
  const rule = TRANSITION_MAP[event];
  if (rule.from.includes(currentStatus)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Invalid transition: event "${event}" cannot be applied when status is "${currentStatus}". Allowed statuses: ${rule.from.join(', ')}`,
  };
}
