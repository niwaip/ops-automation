import { describe, it, expect } from 'vitest';
import {
  IGNORED_BUSINESS_PARAM_KEYS,
  isUserFacingBusinessParam,
} from './ignoredBusinessParams';

describe('ignoredBusinessParams', () => {
  it('strictly excludes internal coordination and comment injection metadata keys', () => {
    const internalKeys = [
      'hasAnnotatedDocx',
      'annotatedDocxUrl',
      'commentInjectionError',
      'commentInjectionStats',
      'sourceAttachmentId',
      'sourceDocumentHash',
      'sourceDocumentVersion',
      'reviewDraft',
      'approvalOpinions',
      'stagedComments',
      'findingStates',
      'ruleSetDigest',
      'ruleSetId',
      'ruleSetVersion',
      'taskId',
      'taskType',
      'stage',
      'isReceipt',
      'receiptAction',
      'isAsync',
    ];

    for (const key of internalKeys) {
      expect(IGNORED_BUSINESS_PARAM_KEYS.has(key)).toBe(true);
      expect(isUserFacingBusinessParam(key, 'some-value')).toBe(false);
    }
  });

  it('excludes non-primitive objects, private keys, and empty values', () => {
    expect(isUserFacingBusinessParam('_internalTraceId', '123')).toBe(false);
    expect(isUserFacingBusinessParam('customObject', { foo: 'bar' })).toBe(false);
    expect(isUserFacingBusinessParam('emptyKey', '')).toBe(false);
    expect(isUserFacingBusinessParam('nullKey', null)).toBe(false);
    expect(isUserFacingBusinessParam('undefinedKey', undefined)).toBe(false);
  });

  it('allows user-facing custom business attributes to pass through', () => {
    expect(isUserFacingBusinessParam('taxId', '91310000XXXXXXXXXX')).toBe(true);
    expect(isUserFacingBusinessParam('deliveryAddress', '北京市海淀区中关村南大街1号')).toBe(true);
    expect(isUserFacingBusinessParam('invoiceType', '增值税专用发票')).toBe(true);
    expect(isUserFacingBusinessParam('isVipCustomer', true)).toBe(true);
    expect(isUserFacingBusinessParam('headcount', 50)).toBe(true);
  });
});
