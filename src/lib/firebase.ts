import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  setLogLevel,
  doc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { normalizeLocationHub } from './location';

// Silence internal @firebase/firestore WebChannel retry logs so transient carrier
// switches never trigger console.error overlays in the browser.
try {
  setLogLevel('silent');
} catch {
  // Ignore if unsupported
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const REST_BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;
const API_KEY_PARAM = `key=${encodeURIComponent(firebaseConfig.apiKey)}`;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  throw new Error(JSON.stringify(errInfo));
}

// Blueprint constants for defensive validation synchronicity
export const BLUEPRINT_CONSTRAINTS = {
  ID_MAX_LEN: 128,
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  NAME_MAX_LEN: 80,
  LOCATION_MAX_LEN: 120,
  INTENT_CATEGORY_MAX_LEN: 32,
  INTENT_SUMMARY_MAX_LEN: 500,
  PREVIEW_MAX_LEN: 500,
  MESSAGE_TEXT_MAX_LEN: 2000,
  OWNER_TITLE_MAX_LEN: 80,
  STATUS_TEXT_MAX_LEN: 80,
} as const;

export type IntentCategory = 'ORDER' | 'INVESTMENT' | 'CHAT' | 'COLLABORATION';

export interface VisitorRecord {
  visitorId: string;
  name: string;
  location: string;
  intentCategory: IntentCategory;
  intentSummary: string;
  lastMessagePreview: string;
  status: 'online' | 'active' | 'archived';
  unreadForOwner: number;
  createdAt: Timestamp | { toMillis: () => number } | null;
  updatedAt: Timestamp | { toMillis: () => number } | null;
}

export interface MessageRecord {
  id: string;
  visitorId: string;
  senderRole: 'visitor' | 'owner';
  senderName: string;
  text: string;
  intentCategory: IntentCategory;
  createdAt: Timestamp | { toMillis: () => number } | null;
}

export interface OwnerPresenceRecord {
  ownerName: string;
  ownerTitle: string;
  statusText: string;
  isOnline: boolean;
  updatedAt: Timestamp | { toMillis: () => number } | null;
}

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, BLUEPRINT_CONSTRAINTS.ID_MAX_LEN);
  return cleaned || `v_${Date.now()}`;
}

export function clampText(raw: string, maxLen: number, fallback = 'Anonymous'): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

export function generateSafeId(prefix: string): string {
  const randomPart = Math.random().toString(36).substring(2, 10);
  return sanitizeId(`${prefix}_${Date.now()}_${randomPart}`);
}

function makeTimestampLike(isoString?: string): { toMillis: () => number } {
  const ms = isoString ? Date.parse(isoString) || Date.now() : Date.now();
  return { toMillis: () => ms };
}

// Helper to parse Firestore REST v1 document fields
interface RestField {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  timestampValue?: string;
}

interface RestDoc {
  name?: string;
  fields?: Record<string, RestField>;
}

function parseVisitorFromRest(docObj: RestDoc): VisitorRecord | null {
  const f = docObj.fields;
  if (!f) return null;
  const docId = docObj.name ? docObj.name.split('/').pop() || '' : '';
  const vId = f.visitorId?.stringValue || docId;
  if (!vId) return null;
  const status = (f.status?.stringValue || 'online') as 'online' | 'active' | 'archived';
  if (!['online', 'active', 'archived'].includes(status)) return null;

  return {
    visitorId: vId,
    name: f.name?.stringValue || 'Anonymous',
    location: normalizeLocationHub(f.location?.stringValue || '', vId),
    intentCategory: (f.intentCategory?.stringValue as IntentCategory) || 'CHAT',
    intentSummary: f.intentSummary?.stringValue || '',
    lastMessagePreview: f.lastMessagePreview?.stringValue || '',
    status,
    unreadForOwner: Number(f.unreadForOwner?.integerValue ?? 0),
    createdAt: makeTimestampLike(f.createdAt?.timestampValue),
    updatedAt: makeTimestampLike(f.updatedAt?.timestampValue),
  };
}

function parseMessageFromRest(docObj: RestDoc): MessageRecord | null {
  const f = docObj.fields;
  if (!f) return null;
  const docId = docObj.name ? docObj.name.split('/').pop() || '' : '';
  const visitorId = f.visitorId?.stringValue || '';
  if (!visitorId) return null;

  return {
    id: docId || generateSafeId('msg'),
    visitorId,
    senderRole: f.senderRole?.stringValue === 'owner' ? 'owner' : 'visitor',
    senderName: f.senderName?.stringValue || 'Anonymous',
    text: f.text?.stringValue || '',
    intentCategory: (f.intentCategory?.stringValue as IntentCategory) || 'CHAT',
    createdAt: makeTimestampLike(f.createdAt?.timestampValue),
  };
}

async function restGetVisitor(visitorId: string): Promise<VisitorRecord | null> {
  try {
    const res = await fetch(`${REST_BASE_URL}/visitors/${visitorId}?${API_KEY_PARAM}`);
    if (!res.ok) return null;
    const data = (await res.json()) as RestDoc;
    return parseVisitorFromRest(data);
  } catch {
    return null;
  }
}

async function restUpsertVisitor(params: {
  visitorId: string;
  name: string;
  location: string;
  intentCategory: IntentCategory;
  intentSummary: string;
  lastMessagePreview: string;
  status: 'online' | 'active' | 'archived';
  unreadForOwner: number;
  createdAtIso: string;
  updatedAtIso: string;
}): Promise<boolean> {
  try {
    const body = {
      fields: {
        visitorId: { stringValue: params.visitorId },
        name: { stringValue: params.name },
        location: { stringValue: params.location },
        intentCategory: { stringValue: params.intentCategory },
        intentSummary: { stringValue: params.intentSummary },
        lastMessagePreview: { stringValue: params.lastMessagePreview },
        status: { stringValue: params.status },
        unreadForOwner: { integerValue: String(params.unreadForOwner) },
        createdAt: { timestampValue: params.createdAtIso },
        updatedAt: { timestampValue: params.updatedAtIso },
      },
    };
    const res = await fetch(`${REST_BASE_URL}/visitors/${params.visitorId}?${API_KEY_PARAM}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function restCreateMessage(params: {
  messageId: string;
  visitorId: string;
  senderRole: 'visitor' | 'owner';
  senderName: string;
  text: string;
  intentCategory: IntentCategory;
  createdAtIso: string;
}): Promise<boolean> {
  try {
    const body = {
      fields: {
        visitorId: { stringValue: params.visitorId },
        senderRole: { stringValue: params.senderRole },
        senderName: { stringValue: params.senderName },
        text: { stringValue: params.text },
        intentCategory: { stringValue: params.intentCategory },
        createdAt: { timestampValue: params.createdAtIso },
      },
    };
    const res = await fetch(
      `${REST_BASE_URL}/messages?documentId=${encodeURIComponent(params.messageId)}&${API_KEY_PARAM}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function createOrUpdateVisitorSession(params: {
  visitorId: string;
  name: string;
  location: string;
  intentCategory: IntentCategory;
  intentSummary: string;
}): Promise<string> {
  const safeId = sanitizeId(params.visitorId);
  const safeName = clampText(params.name, BLUEPRINT_CONSTRAINTS.NAME_MAX_LEN, 'Anonymous');
  const normalizedLoc = normalizeLocationHub(params.location, safeId);
  const safeLocation = clampText(
    normalizedLoc,
    BLUEPRINT_CONSTRAINTS.LOCATION_MAX_LEN,
    'Austin, TX, USA'
  );
  const safeSummary = clampText(
    params.intentSummary,
    BLUEPRINT_CONSTRAINTS.INTENT_SUMMARY_MAX_LEN,
    `Inquiry regarding ${params.intentCategory}`
  );
  const nowIso = new Date().toISOString();

  // Check existing visitor via fast REST lookup
  const existing = await restGetVisitor(safeId);
  const createdAtIso =
    existing?.createdAt && typeof existing.createdAt.toMillis === 'function'
      ? new Date(existing.createdAt.toMillis()).toISOString()
      : nowIso;
  const unreadCount = Math.min(10000, Math.max(0, (existing?.unreadForOwner ?? 0) + 1));

  // Write via REST immediately (completes in ~200ms even if WebChannel is throttled)
  await restUpsertVisitor({
    visitorId: safeId,
    name: safeName,
    location: safeLocation,
    intentCategory: params.intentCategory,
    intentSummary: safeSummary,
    lastMessagePreview: safeSummary,
    status: 'online',
    unreadForOwner: unreadCount,
    createdAtIso,
    updatedAtIso: nowIso,
  });

  const msgId = generateSafeId('msg');
  await restCreateMessage({
    messageId: msgId,
    visitorId: safeId,
    senderRole: 'visitor',
    senderName: safeName,
    text: safeSummary,
    intentCategory: params.intentCategory,
    createdAtIso: nowIso,
  });

  return safeId;
}

export async function sendChatMessage(params: {
  visitorId: string;
  senderRole: 'visitor' | 'owner';
  senderName: string;
  text: string;
  intentCategory: IntentCategory;
  currentUnreadForOwner?: number;
}): Promise<void> {
  const safeVisitorId = sanitizeId(params.visitorId);
  const safeSenderName = clampText(
    params.senderName,
    BLUEPRINT_CONSTRAINTS.NAME_MAX_LEN,
    params.senderRole === 'owner' ? 'Elon Musk' : 'Anonymous'
  );
  const safeText = clampText(params.text, BLUEPRINT_CONSTRAINTS.MESSAGE_TEXT_MAX_LEN, 'Hello');
  const safePreview = safeText.slice(0, BLUEPRINT_CONSTRAINTS.PREVIEW_MAX_LEN);
  const msgId = generateSafeId('msg');
  const nowIso = new Date().toISOString();

  // Ensure visitor document exists and update preview via fast REST API
  const existing = await restGetVisitor(safeVisitorId);
  const nextUnread =
    params.senderRole === 'visitor'
      ? Math.min(10000, Math.max(0, (existing?.unreadForOwner ?? params.currentUnreadForOwner ?? 0) + 1))
      : 0;

  if (existing) {
    const createdAtIso =
      existing.createdAt && typeof existing.createdAt.toMillis === 'function'
        ? new Date(existing.createdAt.toMillis()).toISOString()
        : nowIso;
    await restUpsertVisitor({
      visitorId: safeVisitorId,
      name: existing.name || safeSenderName,
      location: normalizeLocationHub(existing.location, safeVisitorId),
      intentCategory: existing.intentCategory || params.intentCategory,
      intentSummary: existing.intentSummary || safePreview,
      lastMessagePreview: safePreview,
      status: 'online',
      unreadForOwner: nextUnread,
      createdAtIso,
      updatedAtIso: nowIso,
    });
  } else {
    await restUpsertVisitor({
      visitorId: safeVisitorId,
      name: safeSenderName,
      location: normalizeLocationHub('', safeVisitorId),
      intentCategory: params.intentCategory,
      intentSummary: safePreview,
      lastMessagePreview: safePreview,
      status: 'online',
      unreadForOwner: nextUnread,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
  }

  await restCreateMessage({
    messageId: msgId,
    visitorId: safeVisitorId,
    senderRole: params.senderRole,
    senderName: safeSenderName,
    text: safeText,
    intentCategory: params.intentCategory,
    createdAtIso: nowIso,
  });
}

export async function clearVisitorUnread(visitorId: string): Promise<void> {
  const safeVisitorId = sanitizeId(visitorId);
  const existing = await restGetVisitor(safeVisitorId);
  if (!existing || existing.unreadForOwner === 0) return;
  const nowIso = new Date().toISOString();
  const createdAtIso =
    existing.createdAt && typeof existing.createdAt.toMillis === 'function'
      ? new Date(existing.createdAt.toMillis()).toISOString()
      : nowIso;

  await restUpsertVisitor({
    visitorId: safeVisitorId,
    name: existing.name,
    location: normalizeLocationHub(existing.location, safeVisitorId),
    intentCategory: existing.intentCategory,
    intentSummary: existing.intentSummary,
    lastMessagePreview: existing.lastMessagePreview,
    status: existing.status,
    unreadForOwner: 0,
    createdAtIso,
    updatedAtIso: nowIso,
  });
}

export async function saveOwnerPresence(params: {
  ownerName: string;
  ownerTitle: string;
  statusText: string;
  isOnline: boolean;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const body = {
    fields: {
      ownerName: {
        stringValue: clampText(params.ownerName, BLUEPRINT_CONSTRAINTS.NAME_MAX_LEN, 'Elon Musk'),
      },
      ownerTitle: {
        stringValue: clampText(
          params.ownerTitle,
          BLUEPRINT_CONSTRAINTS.OWNER_TITLE_MAX_LEN,
          'Owner · Starbase Command'
        ),
      },
      statusText: {
        stringValue: clampText(
          params.statusText,
          BLUEPRINT_CONSTRAINTS.STATUS_TEXT_MAX_LEN,
          'Online in Starbase'
        ),
      },
      isOnline: { booleanValue: Boolean(params.isOnline) },
      updatedAt: { timestampValue: nowIso },
    },
  };

  try {
    await fetch(`${REST_BASE_URL}/presence/starbase_owner?${API_KEY_PARAM}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Also fallback to SDK write if needed
    try {
      await setDoc(doc(db, 'presence', 'starbase_owner'), {
        ownerName: clampText(params.ownerName, BLUEPRINT_CONSTRAINTS.NAME_MAX_LEN, 'Elon Musk'),
        ownerTitle: clampText(
          params.ownerTitle,
          BLUEPRINT_CONSTRAINTS.OWNER_TITLE_MAX_LEN,
          'Owner · Starbase Command'
        ),
        statusText: clampText(
          params.statusText,
          BLUEPRINT_CONSTRAINTS.STATUS_TEXT_MAX_LEN,
          'Online in Starbase'
        ),
        isOnline: Boolean(params.isOnline),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore
    }
  }
}

export function subscribeToVisitors(
  onData: (visitors: VisitorRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let active = true;

  const fetchViaRest = async () => {
    if (!active) return;
    try {
      const res = await fetch(`${REST_BASE_URL}/visitors?pageSize=100&${API_KEY_PARAM}`);
      if (!res.ok) return;
      const json = (await res.json()) as { documents?: RestDoc[] };
      const docs = json.documents || [];
      const list: VisitorRecord[] = [];
      for (const docObj of docs) {
        const parsed = parseVisitorFromRest(docObj);
        if (parsed) {
          list.push(parsed);
        }
      }
      list.sort((a, b) => {
        const tA = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const tB = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
      if (active) onData(list);
    } catch {
      // Ignore transient poll errors
    }
  };

  fetchViaRest();
  const pollTimer = setInterval(fetchViaRest, 2500);

  const unsubSdk = onSnapshot(
    collection(db, 'visitors'),
    (snapshot) => {
      if (!active) return;
      const list: VisitorRecord[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d && ['online', 'active', 'archived'].includes(d.status)) {
          const vId = d.visitorId || docSnap.id;
          const cleanLoc = normalizeLocationHub(d.location || '', vId);
          if (d.location !== cleanLoc) {
            updateDoc(doc(db, 'visitors', docSnap.id), {
              location: cleanLoc,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
          list.push({
            visitorId: vId,
            name: d.name || 'Anonymous',
            location: cleanLoc,
            intentCategory: d.intentCategory || 'CHAT',
            intentSummary: d.intentSummary || '',
            lastMessagePreview: d.lastMessagePreview || '',
            status: d.status || 'online',
            unreadForOwner: typeof d.unreadForOwner === 'number' ? d.unreadForOwner : 0,
            createdAt: d.createdAt || null,
            updatedAt: d.updatedAt || null,
          });
        }
      });
      list.sort((a, b) => {
        const tA = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const tB = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
    }
  );

  return () => {
    active = false;
    clearInterval(pollTimer);
    unsubSdk();
  };
}

export function subscribeToVisitorDoc(
  visitorId: string,
  onData: (visitor: VisitorRecord | null) => void
): Unsubscribe {
  const safeId = sanitizeId(visitorId);
  let active = true;

  const fetchViaRest = async () => {
    if (!active) return;
    const rec = await restGetVisitor(safeId);
    if (active && rec) {
      onData(rec);
    }
  };

  fetchViaRest();
  const pollTimer = setInterval(fetchViaRest, 3000);

  const unsubSdk = onSnapshot(
    doc(db, 'visitors', safeId),
    (docSnap) => {
      if (!active) return;
      if (!docSnap.exists()) {
        return;
      }
      const d = docSnap.data();
      const vId = d.visitorId || docSnap.id;
      const cleanLoc = normalizeLocationHub(d.location || '', vId);
      onData({
        visitorId: vId,
        name: d.name || 'Anonymous',
        location: cleanLoc,
        intentCategory: d.intentCategory || 'CHAT',
        intentSummary: d.intentSummary || '',
        lastMessagePreview: d.lastMessagePreview || '',
        status: d.status || 'online',
        unreadForOwner: typeof d.unreadForOwner === 'number' ? d.unreadForOwner : 0,
        createdAt: d.createdAt || null,
        updatedAt: d.updatedAt || null,
      });
    },
    () => {}
  );

  return () => {
    active = false;
    clearInterval(pollTimer);
    unsubSdk();
  };
}

export function subscribeToVisitorMessages(
  visitorId: string,
  onData: (messages: MessageRecord[]) => void
): Unsubscribe {
  const safeVisitorId = sanitizeId(visitorId);
  let active = true;

  const fetchViaRest = async () => {
    if (!active) return;
    try {
      const res = await fetch(`${REST_BASE_URL}/messages?pageSize=200&${API_KEY_PARAM}`);
      if (!res.ok) return;
      const json = (await res.json()) as { documents?: RestDoc[] };
      const docs = json.documents || [];
      const msgs: MessageRecord[] = [];
      for (const docObj of docs) {
        const parsed = parseMessageFromRest(docObj);
        if (parsed && parsed.visitorId === safeVisitorId) {
          msgs.push(parsed);
        }
      }
      msgs.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() ?? 0;
        const tB = b.createdAt?.toMillis?.() ?? 0;
        return tA - tB;
      });
      if (active) onData(msgs);
    } catch {
      // Ignore transient poll errors
    }
  };

  fetchViaRest();
  const pollTimer = setInterval(fetchViaRest, 2000);

  const q = query(collection(db, 'messages'), where('visitorId', '==', safeVisitorId));
  const unsubSdk = onSnapshot(
    q,
    (snapshot) => {
      if (!active) return;
      const msgs: MessageRecord[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d && d.visitorId === safeVisitorId) {
          msgs.push({
            id: docSnap.id,
            visitorId: d.visitorId,
            senderRole: d.senderRole === 'owner' ? 'owner' : 'visitor',
            senderName: d.senderName || 'Anonymous',
            text: d.text || '',
            intentCategory: d.intentCategory || 'CHAT',
            createdAt: d.createdAt || null,
          });
        }
      });
      msgs.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() ?? Date.now();
        const tB = b.createdAt?.toMillis?.() ?? Date.now();
        return tA - tB;
      });
      onData(msgs);
    },
    () => {}
  );

  return () => {
    active = false;
    clearInterval(pollTimer);
    unsubSdk();
  };
}

export function subscribeToOwnerPresence(
  onData: (presence: OwnerPresenceRecord) => void
): Unsubscribe {
  let active = true;

  const fetchViaRest = async () => {
    if (!active) return;
    try {
      const res = await fetch(`${REST_BASE_URL}/presence/starbase_owner?${API_KEY_PARAM}`);
      if (!res.ok) return;
      const docObj = (await res.json()) as RestDoc;
      const f = docObj.fields;
      if (f && active) {
        onData({
          ownerName: f.ownerName?.stringValue || 'Elon Musk',
          ownerTitle: f.ownerTitle?.stringValue || 'Owner · Starbase Command',
          statusText: f.statusText?.stringValue || 'Online in Starbase',
          isOnline: f.isOnline?.booleanValue !== undefined ? f.isOnline.booleanValue : true,
          updatedAt: makeTimestampLike(f.updatedAt?.timestampValue),
        });
      }
    } catch {
      // Ignore
    }
  };

  fetchViaRest();

  const unsubSdk = onSnapshot(
    doc(db, 'presence', 'starbase_owner'),
    (docSnap) => {
      if (!active) return;
      if (!docSnap.exists()) {
        onData({
          ownerName: 'Elon Musk',
          ownerTitle: 'Owner · Starbase Command',
          statusText: 'Online in Starbase',
          isOnline: true,
          updatedAt: null,
        });
        return;
      }
      const d = docSnap.data();
      onData({
        ownerName: d.ownerName || 'Elon Musk',
        ownerTitle: d.ownerTitle || 'Owner · Starbase Command',
        statusText: d.statusText || 'Online in Starbase',
        isOnline: d.isOnline !== undefined ? Boolean(d.isOnline) : true,
        updatedAt: d.updatedAt || null,
      });
    },
    () => {}
  );

  return () => {
    active = false;
    unsubSdk();
  };
}
