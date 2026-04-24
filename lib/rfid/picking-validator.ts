import type { LinenStatus } from '@/lib/rfid/status-machine';

export type ValidationAction = 'BLOCK' | 'ASK_USER' | 'SKIP';

export type ValidationResult = {
  valid: boolean;
  code?: string;
  message?: string;
  detail?: string;
  action?: ValidationAction;
};

export type PickingValidationInput = {
  rfid_tag_id: string;
  session_org_id: string;
  isDuplicate: boolean;
  item: {
    id: string;
    org_id: string;
    status: LinenStatus;
    current_batch_id: string | null;
    category_id: string | null;
    category_name: string;
  } | null;
  orderItem: {
    category_id: string;
    category_name: string;
    picked_qty: number;
    requested_qty: number;
  } | null;
  allowWrongCategory?: boolean;
  allowOverPick?: boolean;
};

export function statusDescription(status: LinenStatus): string {
  if (status === 'out') return 'อยู่ที่ client แล้ว';
  if (status === 'dirty') return 'รอซักอยู่';
  if (status === 'washing') return 'กำลังซักอยู่';
  if (status === 'rewash') return 'อยู่ในคิว rewash';
  if (status === 'rejected') return 'เสียหาย ใช้ไม่ได้แล้ว';
  if (status === 'lost') return 'ถูก mark ว่าหาย';
  if (status === 'drying') return 'อยู่ในเครื่องอบ';
  if (status === 'folding') return 'อยู่ในขั้นตอนพับ/QC';
  return 'พร้อมใช้งาน';
}

export function validateTagExists(input: PickingValidationInput): ValidationResult {
  if (input.item) return { valid: true };
  return {
    valid: false,
    code: 'UNKNOWN_TAG',
    message: 'Tag ไม่ได้ลงทะเบียนในระบบ',
    action: 'BLOCK',
  };
}

export function validateOrgMatch(input: PickingValidationInput): ValidationResult {
  if (!input.item) {
    return { valid: false, code: 'UNKNOWN_TAG', message: 'Tag ไม่ได้ลงทะเบียนในระบบ', action: 'BLOCK' };
  }

  if (input.item.org_id === input.session_org_id) return { valid: true };
  return {
    valid: false,
    code: 'WRONG_ORG',
    message: 'Tag นี้เป็นของ org อื่น',
    action: 'BLOCK',
  };
}

export function validateCleanStatus(input: PickingValidationInput): ValidationResult {
  if (!input.item) {
    return { valid: false, code: 'UNKNOWN_TAG', message: 'Tag ไม่ได้ลงทะเบียนในระบบ', action: 'BLOCK' };
  }

  if (input.item.status === 'clean') return { valid: true };
  return {
    valid: false,
    code: 'NOT_CLEAN',
    message: `Item status เป็น '${input.item.status}' ไม่พร้อมส่ง`,
    detail: statusDescription(input.item.status),
    action: 'BLOCK',
  };
}

export function validateBatchAssignment(input: PickingValidationInput): ValidationResult {
  if (!input.item) {
    return { valid: false, code: 'UNKNOWN_TAG', message: 'Tag ไม่ได้ลงทะเบียนในระบบ', action: 'BLOCK' };
  }

  if (!input.item.current_batch_id) return { valid: true };
  return {
    valid: false,
    code: 'IN_OTHER_BATCH',
    message: `Item อยู่ใน batch ${input.item.current_batch_id} แล้ว`,
    detail: 'ติดต่อผู้ดูแลระบบ',
    action: 'BLOCK',
  };
}

export function validateCategoryMatch(input: PickingValidationInput): ValidationResult {
  if (input.orderItem || input.allowWrongCategory) return { valid: true };

  const categoryName = input.item?.category_name || 'Item';
  return {
    valid: false,
    code: 'WRONG_CATEGORY',
    message: `${categoryName} ไม่ได้อยู่ใน order นี้`,
    action: 'ASK_USER',
  };
}

export function validateOverPick(input: PickingValidationInput): ValidationResult {
  if (!input.orderItem) return { valid: true };
  if (input.allowOverPick) return { valid: true };

  const { picked_qty, requested_qty, category_name } = input.orderItem;
  if (picked_qty < requested_qty) return { valid: true };

  return {
    valid: false,
    code: 'OVER_PICK',
    message: `${category_name} ครบแล้ว (${picked_qty}/${requested_qty})`,
    action: 'ASK_USER',
  };
}

export function validateDuplicateScan(input: PickingValidationInput): ValidationResult {
  if (!input.isDuplicate) return { valid: true };
  return {
    valid: false,
    code: 'DUPLICATE',
    message: 'duplicate scan in current session',
    action: 'SKIP',
  };
}

export function runPickingValidations(input: PickingValidationInput): ValidationResult {
  const checks = [
    validateTagExists,
    validateOrgMatch,
    validateCleanStatus,
    validateBatchAssignment,
    validateCategoryMatch,
    validateOverPick,
    validateDuplicateScan,
  ];

  for (const check of checks) {
    const result = check(input);
    if (!result.valid) return result;
  }

  return { valid: true };
}
