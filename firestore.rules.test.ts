/**
 * Verification suite for Firestore Security Rules against Dirty Dozen payloads.
 */
export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'delete';
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  { id: 1, name: 'Shadow Field Injection on Visitor Create', collection: 'visitors', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 2, name: 'Oversized Message Text (>2000 chars)', collection: 'messages', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 3, name: 'Orphaned Message Creation without Visitor doc', collection: 'messages', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 4, name: 'Invalid Intent Category Enum', collection: 'visitors', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 5, name: 'Forged Client Timestamp on Message Create', collection: 'messages', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 6, name: 'Message Mutation / Update Attempt', collection: 'messages', operation: 'update', expectedResult: 'PERMISSION_DENIED' },
  { id: 7, name: 'Message Deletion Attempt', collection: 'messages', operation: 'delete', expectedResult: 'PERMISSION_DENIED' },
  { id: 8, name: 'Visitor Immutable Field Tampering', collection: 'visitors', operation: 'update', expectedResult: 'PERMISSION_DENIED' },
  { id: 9, name: 'ID Poisoning Attack with Special Chars', collection: 'visitors', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 10, name: 'Negative Unread Counter on Visitor', collection: 'visitors', operation: 'update', expectedResult: 'PERMISSION_DENIED' },
  { id: 11, name: 'Unapproved Update Keys on Visitor', collection: 'visitors', operation: 'update', expectedResult: 'PERMISSION_DENIED' },
  { id: 12, name: 'Invalid Presence Document ID', collection: 'presence', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
];
