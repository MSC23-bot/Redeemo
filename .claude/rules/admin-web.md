---
paths:
  - "apps/admin-web/**"
---

# Admin panel (Next.js) rules

- Dev port 3002. Next 15 + Tailwind 4 + shadcn; deliberately NEUTRAL styling (no brand
  fonts); Node 24.
- Capability gating is two-layer and BOTH layers are required: UI gates on the capability
  mirror (never fire a request the admin lacks the capability for) AND the backend 403 is
  defence-in-depth. Never rely on only one.
- Approval queue uses claim-to-act: unclaimed → Claim; claimed-by-me → act; claimed-by-other
  → read-only (SUPER_ADMIN may force-release). Release is claimer-or-SUPER_ADMIN only.
- Notifications: admin bell reads are isolated by `recipientType ADMIN` + `recipientId`;
  `adminNotify` is in-app-only (no email/CommunicationLog); self-action silence and
  anti-storm rules apply to any new emitter.
- Documents: presign per view; raw R2 keys are never returned to the client; storage
  failures degrade to `available:false`, never 500.
- Review/timeline payloads: `CommunicationLog.payload` and `branch_pin` audit rows are never
  selected; comms timeline is owner-scoped.
- Auth is challenge-bound HMAC email OTP with a two-step login; session in localStorage
  with a capability mirror (admin-web only; merchant-web deliberately differs).
