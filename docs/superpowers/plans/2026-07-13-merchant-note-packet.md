# Plan: MerchantNote packet (internal notes, bundled-window packet 3 of 4)

Status: ACTIVE · Tier 3 (schema + new backend contract)
Owner authority: grill-me 2026-07-10 OD2 (memory `admin-recruitment-owner-decisions-2026-07-10`);
D51 Notes-tab spec in `docs/superpowers/specs/2026-07-10-admin-panel-module-specs/merchant-360-spec.md`
(Tab 8). Sibling of the MerchantLead packet (#500, merged eeaab9df).
Migration posture: CREATE-ONLY, UNAPPLIED. Joins the owner-gated bundled staging window
(packets: AdminCapabilityGrant [main, unapplied] · MerchantLead [main, unapplied] · THIS ·
MerchantAgreementRecord/D65 [unbuilt]).

## 1. Scope

Backend data layer for internal per-merchant notes: model + routes + audit + tests. The
Merchant 360 Notes tab UI consumes this later. NOT in scope: attachments (OD2: DEFERRED),
customer-side notes (DSAR data, Customer 360, out of scope), the UI itself.

## 2. Reconciliation: prototype vs owner-locked OD2 (OD2 wins)

| Point | Prototype (merchant-360-spec Tab 8) | OD2 owner-locked (used here) |
|---|---|---|
| Access | read: SUPER_ADMIN/OPERATIONS/SALES/FINANCE/SUPPORT; write: SUPER_ADMIN/OPERATIONS/SALES; caps `notes:read`/`notes:write` | readable + writable by ALL roles incl FIELD; SALES role does not exist |
| Attachments | composer has "Attach a file" | DEFERRED (no attachment surface in this packet) |
| PII | banner: customer-side notes are DSAR data, live elsewhere | same + "no customer personal data" hint (UI copy later; comment now) |

Capability decision (Fable, implements OD2): new `merchant:notes` capability present in EVERY
role baseline (OPERATIONS, FIELD, FINANCE, CONTENT, SUPPORT; SUPER_ADMIN via short-circuit).
Grounded constraint: FINANCE/CONTENT/SUPPORT baselines are EMPTY today, so no existing cap can
express "all roles". A universal cap keeps the fail-closed cap-gated house pattern (the personal
bell is the only ungated admin surface, deliberately). NOT added to GRANTABLE_CAPABILITIES
(pointless: already universal).

## 3. Behaviour (D51, kept)

- Add note: non-empty body; author stamped; ADDED history event.
- Edit: OWN + ACTIVE notes only; prior body kept in history (EDITED event carries priorBody);
  `editedAt` stamped; note shows "Edited".
- Retract: OWN + ACTIVE notes only; SOFT delete: status RETRACTED + retractedBy/At/Reason
  (reason REQUIRED); body preserved (strike-through in UI). NOTHING is ever hard-deleted.
- History: chronological ADDED/EDITED/RETRACTED events (who + when) per note.
- List: per merchant, newest first, bounded (take 500, mirroring leads v1 bound).
- v1 gap accepted: no moderation override (SUPER_ADMIN cannot retract another author's note);
  spec says own-only; revisit if abuse appears.

## 4. Schema (create-only)

```prisma
enum MerchantNoteStatus { ACTIVE RETRACTED }
enum MerchantNoteAction { ADDED EDITED RETRACTED }

model MerchantNote {
  id              String             @id @default(uuid())
  merchantId      String
  merchant        Merchant           @relation(fields: [merchantId], references: [id], onDelete: Restrict)
  authorAdminId   String             // AdminUser id; FK like AdminCapabilityGrant
  body            String
  status          MerchantNoteStatus @default(ACTIVE)
  editedAt        DateTime?
  retractedById   String?
  retractedAt     DateTime?
  retractedReason String?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  events          MerchantNoteEvent[]
  @@index([merchantId, createdAt])
}

model MerchantNoteEvent {
  id            String             @id @default(uuid())
  noteId        String
  note          MerchantNote       @relation(fields: [noteId], references: [id], onDelete: Restrict)
  action        MerchantNoteAction
  actorAdminId  String
  priorBody     String?            // EDITED only: the version being replaced
  reason        String?            // RETRACTED only
  createdAt     DateTime           @default(now())
  @@index([noteId, createdAt])
}
```

FK decisions: merchantId + noteId use real FKs (RESTRICT), matching AdminCapabilityGrant's
pattern; the new tables are leaf tables so the migration stays create-only. authorAdminId /
actorAdminId / retractedById follow AdminCapabilityGrant's adminUserId FK precedent ONLY if a
single-FK-per-table keeps the migration simple; builder may use plain strings + service
integrity like MerchantLead if the FK web grows: state the choice in the PR.

## 5. Backend

- Routes `src/api/admin/merchants/notes/` (merchant-scoped):
  `GET /api/v1/admin/merchants/:merchantId/notes` (list + events),
  `POST .../notes` (add), `PATCH .../notes/:noteId` (edit own+active),
  `POST .../notes/:noteId/retract` (own+active, reason required).
  All gated `merchant:notes`. Merchant existence checked (404 MERCHANT_NOT_FOUND, house code).
- Errors: NOTE_NOT_FOUND, NOTE_NOT_ACTIVE, NOTE_NOT_AUTHOR, NOTE_RETRACT_REASON_REQUIRED.
- Audit: MERCHANT_NOTE_ADDED / MERCHANT_NOTE_EDITED / MERCHANT_NOTE_RETRACTED (String column,
  union-only, NO migration), entityId = merchantId, entityType 'merchant' (notes surface in the
  merchant timeline family), metadata { noteId } and reason on retract. Audit rows carry NO note
  BODY values (bodies + prior versions live in MerchantNoteEvent; the lead-packet discipline:
  content does not enter audit rows).
- lastActivity semantics: none (notes have no retention clock; OD2 has no note anonymisation).

## 6. Slices

1. Schema + create-only migration (UNAPPLIED) + `merchant:notes` capability in all baselines +
   capability tests updated.
2. Service + routes + audit + unit tests (add/edit/retract/history/own-only/active-only/
   reason-required/404s/cap fail-closed incl. a FINANCE-role positive test proving OD2).
3. Opus adversarial review -> Fable adjudication -> fixes -> Codex -> owner SHA gate -> merge.

## 7. Boundaries

Create-only migration, unapplied until the owner's bundled window. No provider/env/secrets
actions. Backend tests: `npm run test:unit` only. Branch frozen during review gates; SHA-bound
merge approval. No UI in this packet.
