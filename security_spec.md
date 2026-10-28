# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Direct-Entry Schema Enforcement**: Because Elon Musk Space is explicitly architected as a frictionless direct-entry live communication portal (`NO SIGN IN`, direct entry for global visitors and owner console), every write operation to `/visitors/{visitorId}`, `/messages/{messageId}`, and `/presence/{presenceId}` MUST enforce strict structural schema validation (`hasAll`, `hasOnly`), string length bounds, enum constraints, and server timestamp integrity (`request.time`).
2. **ID Poisoning Guard**: Every path variable (`{visitorId}`, `{messageId}`, `{presenceId}`) MUST satisfy `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
3. **Relational Integrity on Messages**: A `Message` document in `/messages/{messageId}` cannot be created unless its parent visitor session `/visitors/$(incoming().visitorId)` already exists in Firestore (`exists(/databases/$(database)/documents/visitors/$(incoming().visitorId))`). Messages are immutable once sent (updates and deletes are strictly forbidden).
4. **Immutable Creation Metadata**: On `/visitors/{visitorId}`, `visitorId` and `createdAt` are immutable across all updates (`incoming().visitorId == existing().visitorId && incoming().createdAt == existing().createdAt`).
5. **Temporal Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time`.

## 2. The "Dirty Dozen" Payloads

1. **Shadow Field Injection on Visitor Create**: `{ visitorId: "v_1", name: "Alex", location: "Austin, TX", intentCategory: "ORDER", intentSummary: "Cybertruck fleet", lastMessagePreview: "Hello", status: "online", unreadForOwner: 1, createdAt: SERVER_TIME, updatedAt: SERVER_TIME, isAdmin: true }` -> Rejected by `hasOnly()`.
2. **Oversized Message Text (Denial of Wallet)**: `{ visitorId: "v_1", senderRole: "visitor", senderName: "Alex", text: "<2500 chars>", intentCategory: "ORDER", createdAt: SERVER_TIME }` -> Rejected by `data.text.size() <= 2000`.
3. **Orphaned Message Creation**: Creating a message with `visitorId: "non_existent_visitor"` -> Rejected by `exists(/databases/$(database)/documents/visitors/$(incoming().visitorId))`.
4. **Invalid Intent Enum**: Creating a visitor with `intentCategory: "HACK"` -> Rejected by `data.intentCategory in ['ORDER', 'INVESTMENT', 'CHAT', 'COLLABORATION']`.
5. **Forged Client Timestamp on Create**: Creating a message with a past/future timestamp instead of `request.time` -> Rejected by `incoming().createdAt == request.time`.
6. **Message Tampering (Update Attempt)**: Updating an existing `/messages/{messageId}` document's `text` field -> Rejected because `allow update: if false;` on `/messages/{messageId}`.
7. **Message Deletion Attempt**: Deleting an existing `/messages/{messageId}` document -> Rejected because `allow delete: if false;`.
8. **Visitor Immutable Field Tampering**: Updating `/visitors/{visitorId}` with a mutated `createdAt` or `visitorId` -> Rejected by immutability checks.
9. **ID Poisoning Attack**: Creating `/visitors/bad$id!@#` -> Rejected by `isValidId(visitorId)`.
10. **Negative Unread Counter**: Creating or updating `/visitors/{visitorId}` with `unreadForOwner: -5` -> Rejected by `data.unreadForOwner >= 0 && data.unreadForOwner <= 10000`.
11. **Unapproved Update Keys on Visitor**: Attempting to update an unapproved key on `/visitors/{visitorId}` -> Rejected by `affectedKeys().hasOnly(...)`.
12. **Invalid Presence Document ID**: Attempting to write to `/presence/random_doc` instead of `/presence/starbase_owner` -> Rejected by `presenceId == 'starbase_owner'`.
