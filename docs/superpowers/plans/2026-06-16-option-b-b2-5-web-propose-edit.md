# Option B B2.5-web: admin-web UI for propose-sensitive-edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the admin-web UI that consumes the shipped B2.5-core backend so a SUPER_ADMIN can propose a change to a merchant's sensitive text identity fields (businessName, tradingName, description) from `/merchants/[id]`, routed into the existing B1 pending-edit review lane.

**Architecture:** Pure admin-web slice (PR 2 of 2 for B2.5). The backend route `POST /api/v1/admin/merchants/:id/edit-request` (gated `merchant:propose-edit`, strict body `{businessName?, tradingName?, description?, reason}`, returns `{ pendingEditId }`) and `getMerchantDetail`'s new `description` + `hasPendingIdentityEdit` fields are already on `main` (PR #254, merge `9221d05`). This slice adds: the capability mirror, the detail-schema fields, the API method, the mutation hook, the dialog, a new "Business identity" card, two NamedGateBanner mappings, and tests. No backend, no schema, no Prisma changes.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, React Query v5, Zod, Tailwind 4, jest + jsdom + React Testing Library. All changes under `apps/admin-web/**`.

---

## Locked decisions (owner)

1. **Placement:** a separate "Business identity" card after the page header and before the Website card.
2. **No confirmation checkbox.** This creates a review request, not an immediate mutation, so a mandatory reason plus clear "sent for review / not applied until approved" copy is sufficient. (Contrast with B2.2's direct identity edit, which mutates immediately and therefore carries a confirm checkbox.)
3. **`merchant:propose-edit` is SUPER_ADMIN-only**, mirrored by adding it to the `AdminCapability` union but NOT to `ALL_SLICE1_CAPS`.
4. **Changed-field detection:** the dialog submits only changed, non-empty fields plus reason.
5. **Clearing nullable fields is not supported in this slice** (the backend route accepts non-empty strings only and cannot propose null); an empty input means "leave unchanged".
6. **`hasPendingIdentityEdit` true:** keep the Propose affordance visible but disabled with a note pointing the admin to the approval queue.

## Backend contract (already shipped, do NOT change)

- Route: `POST /api/v1/admin/merchants/:id/edit-request`, preHandler `requireAdminCapability('merchant:propose-edit')`.
- Strict request body: `{ businessName?: string(min 1), tradingName?: string(min 1), description?: string(min 1), reason: string(min 1) }`. Non-allow-listed keys (logoUrl/bannerUrl) are rejected with 400.
- Response: `{ pendingEditId: string }`.
- Errors: `NO_SENSITIVE_FIELDS` (no sensitive field in body), `PENDING_EDIT_EXISTS` (one pending edit already awaiting review), `MERCHANT_NOT_FOUND` (unknown merchant; `resolveTargetMerchantForAdmin` allows SUSPENDED).
- `getMerchantDetail` now returns `merchant.description: string | null` and `merchant.hasPendingIdentityEdit: boolean` (the admin-web Zod schema currently strips both because `merchantDetailSchema.merchant` is a plain `z.object()`; this slice surfaces them).
- The B1 applier (`approveEdit` / `rejectEdit`, PR #244) reviews and applies an admin-proposed edit identically to a merchant-proposed one and is UNTOUCHED by this slice. The proposal appears in the existing approval queue / review screen; no new review UI is built here.

## File structure

| File | Responsibility | Action |
|---|---|---|
| `apps/admin-web/lib/auth/session.ts` | Capability mirror | Modify: add `merchant:propose-edit` to the union, NOT to `ALL_SLICE1_CAPS` |
| `apps/admin-web/lib/api/merchants.ts` | Typed API + Zod schemas | Modify: add `description` + `hasPendingIdentityEdit` to `merchantDetailSchema.merchant`; add `ProposeMerchantEditInput`, `proposeEditResponseSchema`, `merchantsApi.proposeEdit` |
| `apps/admin-web/lib/merchants/useMerchantActions.ts` | React Query mutations | Modify: add `useProposeMerchantEdit` (detail + directory invalidation on success AND error) |
| `apps/admin-web/features/merchants/ProposeMerchantEditDialog.tsx` | The propose dialog | Create |
| `apps/admin-web/app/(app)/merchants/[id]/page.tsx` | Detail page | Modify: add `canProposeEdit` gate, `{ kind: 'propose-edit' }` dialog variant, the Business identity card, mount the dialog |
| `apps/admin-web/features/review/NamedGateBanner.tsx` | Error-code copy | Modify: add `NO_SENSITIVE_FIELDS` + `PENDING_EDIT_EXISTS` |
| `apps/admin-web/features/merchants/__tests__/ProposeMerchantEditDialog.test.tsx` | Dialog tests | Create |
| `apps/admin-web/lib/api/__tests__/merchants.test.ts` | API tests | Modify |
| `apps/admin-web/lib/merchants/__tests__/useMerchantActions.test.tsx` | Hook tests | Modify |
| `apps/admin-web/lib/auth/__tests__/session.test.ts` | Capability tests | Modify |
| `apps/admin-web/features/review/__tests__/NamedGateBanner.test.tsx` | Banner tests | Modify |
| `apps/admin-web/app/(app)/merchants/[id]/__tests__/page.test.tsx` | Page tests | Modify |

---

## Task 1: capability mirror

**Files:**
- Modify: `apps/admin-web/lib/auth/session.ts`
- Test: `apps/admin-web/lib/auth/__tests__/session.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `session.test.ts` (it already exercises `hasCapability` per role):

```ts
describe('merchant:propose-edit (B2.5-web, SUPER_ADMIN-only)', () => {
  it('is held by SUPER_ADMIN', () => {
    expect(hasCapability('SUPER_ADMIN', 'merchant:propose-edit')).toBe(true)
  })
  it('is NOT held by OPERATIONS / FINANCE / CONTENT / SUPPORT', () => {
    for (const role of ['OPERATIONS', 'FINANCE', 'CONTENT', 'SUPPORT'] as const) {
      expect(hasCapability(role, 'merchant:propose-edit')).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/admin-web && npx jest lib/auth/__tests__/session.test.ts`
Expected: FAIL (TypeScript: `'merchant:propose-edit'` not assignable to `AdminCapability`).

- [ ] **Step 3: Add the capability to the union (NOT to ALL_SLICE1_CAPS)**

In `session.ts`, after the `merchant:manage-branches` union member, add:

```ts
  // Option B B2.5: gates the admin PROPOSE of a merchant's SENSITIVE identity
  // fields on the merchant's behalf (routes into the B1 pending-edit lane; does
  // NOT directly mutate). NOT in ALL_SLICE1_CAPS -> SUPER_ADMIN-only via the
  // hasCapability short-circuit. Distinct from approval:apply-edit (the B1 APPLY
  // side). Keep aligned with the backend src/api/admin/capability.ts.
  | 'merchant:propose-edit'
```

Do NOT add it to `ALL_SLICE1_CAPS` (so OPERATIONS does not hold it).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/admin-web && npx jest lib/auth/__tests__/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/lib/auth/session.ts apps/admin-web/lib/auth/__tests__/session.test.ts
git commit -m "feat(admin-web): mirror merchant:propose-edit capability (SUPER_ADMIN-only) (B2.5-web)"
```

---

## Task 2: detail schema fields + proposeEdit API method

**Files:**
- Modify: `apps/admin-web/lib/api/merchants.ts`
- Test: `apps/admin-web/lib/api/__tests__/merchants.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `merchants.test.ts` (it already mocks `apiFetch`/`client`; follow the existing mock pattern in that file):

```ts
describe('merchantDetailSchema surfaces B2.5 fields', () => {
  it('parses description + hasPendingIdentityEdit', () => {
    const payload = {
      merchant: {
        id: 'm1', businessName: 'Acme', tradingName: null, status: 'ACTIVE',
        verificationStatus: 'VERIFIED', onboardingStep: 'LIVE', websiteUrl: null,
        vatNumber: null, companyNumber: null, logoUrl: null, category: null,
        primaryCategoryId: null, categoryLocked: false,
        description: 'We sell coffee', hasPendingIdentityEdit: true,
      },
      branches: [],
    }
    const parsed = merchantDetailSchema.parse(payload)
    expect(parsed.merchant.description).toBe('We sell coffee')
    expect(parsed.merchant.hasPendingIdentityEdit).toBe(true)
  })
})

describe('merchantsApi.proposeEdit', () => {
  it('POSTs only changed fields + reason and parses { pendingEditId }', async () => {
    mockApiFetch.mockResolvedValueOnce({ pendingEditId: 'pe-1' })
    const res = await merchantsApi.proposeEdit('m1', { description: 'New bio', reason: 'rebrand' })
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/merchants/m1/edit-request',
      expect.objectContaining({
        method: 'POST',
        auth: true,
        body: JSON.stringify({ description: 'New bio', reason: 'rebrand' }),
      }),
    )
    expect(res.pendingEditId).toBe('pe-1')
  })
})
```

(Use the exact `apiFetch` mock handle name already established in this test file; `mockApiFetch` above is illustrative.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/admin-web && npx jest lib/api/__tests__/merchants.test.ts`
Expected: FAIL (`description`/`hasPendingIdentityEdit` stripped by the schema; `proposeEdit` undefined).

- [ ] **Step 3: Add the schema fields**

In `merchants.ts`, inside `merchantDetailSchema.merchant`, after `categoryLocked: z.boolean(),` add:

```ts
    // B2.5: the SENSITIVE description (read-only here, prefills the propose
    // dialog) + whether an identity edit is already awaiting review (gates the
    // propose affordance). The backend getMerchantDetail returns both.
    description: z.string().nullable(),
    hasPendingIdentityEdit: z.boolean(),
```

- [ ] **Step 4: Add the input type + response schema + API method**

In `merchants.ts`, near the other edit input types, add:

```ts
// B2.5: the propose-sensitive-edit request. Only the 3 text identity fields +
// reason; each field is optional and the caller sends only CHANGED, non-empty
// fields. logoUrl/bannerUrl are intentionally absent (the backend strict body
// rejects them). This creates a review request via the B1 pending-edit lane; it
// does NOT mutate the merchant.
export interface ProposeMerchantEditInput {
  businessName?: string
  tradingName?: string
  description?: string
  reason: string
}

const proposeEditResponseSchema = z.object({ pendingEditId: z.string() })
export type ProposeEditResponse = z.infer<typeof proposeEditResponseSchema>
```

Add to the `merchantsApi` object:

```ts
  /**
   * Propose a change to a merchant's SENSITIVE identity text fields on the
   * merchant's behalf (B2.5, `merchant:propose-edit`-gated; SUPER_ADMIN only).
   * Routes into the B1 pending-edit review lane (does NOT mutate the merchant);
   * an admin then approves/rejects it. reason is mandatory; send only changed,
   * non-empty fields. Returns { pendingEditId }. Throws ApiError
   * (NO_SENSITIVE_FIELDS, PENDING_EDIT_EXISTS, MERCHANT_NOT_FOUND).
   */
  proposeEdit: async (id: string, input: ProposeMerchantEditInput): Promise<ProposeEditResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${id}/edit-request`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    })
    return proposeEditResponseSchema.parse(raw)
  },
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/admin-web && npx jest lib/api/__tests__/merchants.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/lib/api/merchants.ts apps/admin-web/lib/api/__tests__/merchants.test.ts
git commit -m "feat(admin-web): surface description + hasPendingIdentityEdit; add merchantsApi.proposeEdit (B2.5-web)"
```

---

## Task 3: useProposeMerchantEdit mutation

**Files:**
- Modify: `apps/admin-web/lib/merchants/useMerchantActions.ts`
- Test: `apps/admin-web/lib/merchants/__tests__/useMerchantActions.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `useMerchantActions.test.tsx` (follow the existing QueryClient + `renderHook` pattern; assert invalidation via a spy on `queryClient.invalidateQueries`):

```tsx
describe('useProposeMerchantEdit', () => {
  it('invalidates detail + directory on success', async () => {
    // arrange: merchantsApi.proposeEdit resolves { pendingEditId }
    // act: mutateAsync({ description: 'x', reason: 'y' })
    // assert: invalidateQueries called with merchantDetailQueryKey('m1') AND MERCHANTS_LIST_KEY
  })
  it('invalidates detail + directory on error', async () => {
    // arrange: merchantsApi.proposeEdit rejects ApiError(PENDING_EDIT_EXISTS)
    // act + catch
    // assert: same invalidations fire (server state may have moved on)
  })
})
```

Flesh out using the same structure the existing `useEditMerchantIdentity` / `useEditMerchantProfile` tests in this file use.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/admin-web && npx jest lib/merchants/__tests__/useMerchantActions.test.tsx`
Expected: FAIL (`useProposeMerchantEdit` undefined).

- [ ] **Step 3: Add the hook**

In `useMerchantActions.ts`, add `ProposeMerchantEditInput, ProposeEditResponse` to the type import from `@/lib/api/merchants`, then add:

```ts
// Option B B2.5: the SUPER_ADMIN-only propose-sensitive-edit. Routes into the B1
// review lane (does NOT mutate the merchant). Same invalidation contract as the
// B2.1 edits (detail + directory, on success AND error): success flips
// hasPendingIdentityEdit on the detail; an error means server state moved on, so
// a resync is still useful. The route gates merchant:propose-edit server-side.
export function useProposeMerchantEdit(merchantId: string) {
  const invalidate = useInvalidateAfterEdit(merchantId)
  return useMutation<ProposeEditResponse, Error, ProposeMerchantEditInput>({
    mutationFn: (input) => merchantsApi.proposeEdit(merchantId, input),
    onSuccess: invalidate,
    onError: invalidate,
  })
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/admin-web && npx jest lib/merchants/__tests__/useMerchantActions.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/lib/merchants/useMerchantActions.ts apps/admin-web/lib/merchants/__tests__/useMerchantActions.test.tsx
git commit -m "feat(admin-web): useProposeMerchantEdit (detail + directory invalidation) (B2.5-web)"
```

---

## Task 4: ProposeMerchantEditDialog

**Files:**
- Create: `apps/admin-web/features/merchants/ProposeMerchantEditDialog.tsx`
- Test: `apps/admin-web/features/merchants/__tests__/ProposeMerchantEditDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `ProposeMerchantEditDialog.test.tsx` (mirror `EditMerchantIdentityDialog.test.tsx`: wrap in a QueryClientProvider, mock `merchantsApi.proposeEdit`):

```tsx
// 1. prefill: inputs show current businessName / tradingName / description.
// 2. submit disabled when nothing changed (even with a reason).
// 3. submit disabled when a field changed but reason is empty.
// 4. changed-only body: change ONLY description -> proposeEdit called with
//    { description: '<new>', reason: '<r>' } (no businessName, no tradingName).
// 5. emptied field is omitted: clear tradingName (was 'Foo') + change businessName
//    -> body has businessName + reason, NO tradingName key.
// 6. trims: leading/trailing spaces trimmed before compare + send.
// 7. error path: proposeEdit rejects ApiError(PENDING_EDIT_EXISTS) ->
//    NamedGateBanner renders the mapped copy; dialog stays open.
// 8. success path: resolves { pendingEditId } -> onSuccess called.
// 9. cancel calls onCancel; pending state disables Cancel + submit.
// 10. NO confirm checkbox rendered, NO logoUrl/bannerUrl inputs rendered.
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/admin-web && npx jest features/merchants/__tests__/ProposeMerchantEditDialog.test.tsx`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement the dialog**

Create `ProposeMerchantEditDialog.tsx`:

```tsx
'use client'

/**
 * ProposeMerchantEditDialog: a SUPER_ADMIN proposes a change to a merchant's
 * SENSITIVE identity text fields (businessName / tradingName / description) on
 * the merchant's behalf (Option B B2.5-web).
 *
 * This does NOT mutate the merchant. It creates a review request that routes
 * into the B1 pending-edit lane; an admin then approves/rejects it. The copy
 * makes that explicit ("sent for review / not applied until approved").
 *
 *   - Three text inputs prefilled from the current values. Editing any of them,
 *     plus a mandatory reason, enables submit.
 *   - Changed-field detection: only fields whose trimmed value is non-empty AND
 *     differs from the current value are sent. An emptied field is treated as
 *     "leave unchanged" (clearing a value to null is NOT supported in this slice;
 *     the backend route accepts non-empty strings only).
 *   - NO confirmation checkbox (owner decision): the mandatory reason is the gate
 *     because this is a proposal, not an immediate mutation.
 *   - On error: NamedGateBanner inside the dialog.
 *   - Accessible via the shared Dialog primitive (focus-trap, Escape + scrim
 *     close, focus-restore).
 *
 * The Propose affordance that opens this is gated on merchant:propose-edit
 * (SUPER_ADMIN); the backend route is the real enforcement.
 */
import { useRef, useState } from 'react'
import { useProposeMerchantEdit } from '@/lib/merchants/useMerchantActions'
import type { ProposeMerchantEditInput } from '@/lib/api/merchants'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ProposeMerchantEditDialogProps {
  merchantId: string
  current: { businessName: string; tradingName: string | null; description: string | null }
  onSuccess: () => void
  onCancel: () => void
}

export function ProposeMerchantEditDialog({
  merchantId,
  current,
  onSuccess,
  onCancel,
}: ProposeMerchantEditDialogProps) {
  const [businessName, setBusinessName] = useState(current.businessName ?? '')
  const [tradingName, setTradingName] = useState(current.tradingName ?? '')
  const [description, setDescription] = useState(current.description ?? '')
  const [reason, setReason] = useState('')
  const mutation = useProposeMerchantEdit(merchantId)
  const nameRef = useRef<HTMLInputElement>(null)

  // Changed-field detection: send a field only when its trimmed value is
  // non-empty AND differs from the current value. Emptied -> omitted (no clear).
  function buildChangedFields(): Omit<ProposeMerchantEditInput, 'reason'> {
    const out: Omit<ProposeMerchantEditInput, 'reason'> = {}
    const bn = businessName.trim()
    const tn = tradingName.trim()
    const desc = description.trim()
    if (bn !== '' && bn !== current.businessName) out.businessName = bn
    if (tn !== '' && tn !== (current.tradingName ?? '')) out.tradingName = tn
    if (desc !== '' && desc !== (current.description ?? '')) out.description = desc
    return out
  }

  const changed = buildChangedFields()
  const hasChange = Object.keys(changed).length > 0
  const trimmedReason = reason.trim()
  const canSubmit = hasChange && trimmedReason.length > 0 && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync({ ...changed, reason: trimmedReason })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Propose identity changes"
      onClose={onCancel}
      scrimTestId="propose-merchant-edit-scrim"
      panelTestId="propose-merchant-edit-dialog"
      initialFocusRef={nameRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Propose identity changes</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        These changes are sent for review and are not applied until an admin approves them. Recorded
        in the audit log as a proposal on the merchant&apos;s behalf.
      </p>

      <label htmlFor="propose-business-name" className="mb-1.5 block text-sm font-medium text-foreground">
        Business name
      </label>
      <Input
        id="propose-business-name"
        ref={nameRef}
        type="text"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        data-testid="propose-merchant-edit-business-name"
      />

      <label htmlFor="propose-trading-name" className="mb-1.5 mt-4 block text-sm font-medium text-foreground">
        Trading name
      </label>
      <Input
        id="propose-trading-name"
        type="text"
        value={tradingName}
        onChange={(e) => setTradingName(e.target.value)}
        data-testid="propose-merchant-edit-trading-name"
      />

      <label htmlFor="propose-description" className="mb-1.5 mt-4 block text-sm font-medium text-foreground">
        Description
      </label>
      <textarea
        id="propose-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="propose-merchant-edit-description"
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Edit any of these fields. Clearing a value is not supported here.
      </p>

      <label htmlFor="propose-reason" className="mb-1.5 mt-4 block text-sm font-medium text-foreground">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="propose-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are proposing these changes on the merchant's behalf."
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="propose-merchant-edit-reason"
      />

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="propose-merchant-edit-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="propose-merchant-edit-submit"
        >
          {mutation.isPending ? 'Sending...' : 'Send for review'}
        </Button>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/admin-web && npx jest features/merchants/__tests__/ProposeMerchantEditDialog.test.tsx`
Expected: PASS (all 10 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/features/merchants/ProposeMerchantEditDialog.tsx apps/admin-web/features/merchants/__tests__/ProposeMerchantEditDialog.test.tsx
git commit -m "feat(admin-web): ProposeMerchantEditDialog (changed-fields + reason, sent-for-review copy) (B2.5-web)"
```

---

## Task 5: NamedGateBanner mappings

**Files:**
- Modify: `apps/admin-web/features/review/NamedGateBanner.tsx`
- Test: `apps/admin-web/features/review/__tests__/NamedGateBanner.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `NamedGateBanner.test.tsx`:

```tsx
it('maps NO_SENSITIVE_FIELDS (B2.5)', () => {
  render(<NamedGateBanner error={new ApiError(400, 'NO_SENSITIVE_FIELDS', 'x')} />)
  expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('No changes to propose')
})
it('maps PENDING_EDIT_EXISTS (B2.5)', () => {
  render(<NamedGateBanner error={new ApiError(409, 'PENDING_EDIT_EXISTS', 'x')} />)
  expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('already has an identity edit awaiting review')
})
```

(Use the exact `ApiError` constructor signature the existing tests in this file use.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/admin-web && npx jest features/review/__tests__/NamedGateBanner.test.tsx`
Expected: FAIL (codes fall through to the generic message).

- [ ] **Step 3: Add the mappings**

In `NamedGateBanner.tsx` `CODE_MESSAGES`, add (under an `// Option B B2.5: admin propose-sensitive-edit.` comment):

```ts
  NO_SENSITIVE_FIELDS:
    'No changes to propose. Edit at least one field, then send for review.',
  PENDING_EDIT_EXISTS:
    'This merchant already has an identity edit awaiting review. Action that request first.',
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/admin-web && npx jest features/review/__tests__/NamedGateBanner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/features/review/NamedGateBanner.tsx apps/admin-web/features/review/__tests__/NamedGateBanner.test.tsx
git commit -m "feat(admin-web): NamedGateBanner maps NO_SENSITIVE_FIELDS + PENDING_EDIT_EXISTS (B2.5-web)"
```

---

## Task 6: Business identity card + dialog wiring on the detail page

**Files:**
- Modify: `apps/admin-web/app/(app)/merchants/[id]/page.tsx`
- Test: `apps/admin-web/app/(app)/merchants/[id]/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to the page test (mock `useSession` to return the relevant caps; mock `useMerchantDetail` to return a merchant with `description` + `hasPendingIdentityEdit`):

```tsx
// 1. Business identity card renders businessName, tradingName (or 'Not set'),
//    description (or 'Not set').
// 2. "Propose changes" button visible when can('merchant:propose-edit') is true.
// 3. "Propose changes" button ABSENT when can('merchant:propose-edit') is false
//    (e.g. an OPERATIONS-only mock).
// 4. hasPendingIdentityEdit true -> button rendered but DISABLED + the queue note
//    is shown (testid merchant-identity-pending-note).
// 5. clicking "Propose changes" opens ProposeMerchantEditDialog
//    (testid propose-merchant-edit-dialog present).
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/admin-web && npx jest "app/(app)/merchants/[id]/__tests__/page.test.tsx"`
Expected: FAIL (card + button + note not present).

- [ ] **Step 3: Wire the page**

In `page.tsx`:

1. Import the dialog: `import { ProposeMerchantEditDialog } from '@/features/merchants/ProposeMerchantEditDialog'`.
2. Add to the `OpenDialog` union: `| { kind: 'propose-edit' }`.
3. Add the gate near the other caps:

```ts
  // B2.5: proposing sensitive identity edits is SUPER_ADMIN-only
  // (merchant:propose-edit). Routes into the B1 review lane, not a direct edit.
  const canProposeEdit = can('merchant:propose-edit')
```

4. Insert the Business identity card immediately AFTER the read-only header `</header>` and BEFORE the Website `<section>`:

```tsx
          {/* Business identity card (B2.5): the SENSITIVE identity text fields,
              read-only. The Propose affordance is SUPER_ADMIN-only and routes
              into the B1 review lane (it does not mutate the merchant). When an
              identity edit is already pending, the button stays visible but
              disabled with a pointer to the approval queue. */}
          <section
            className="rounded-lg border border-border bg-card p-4"
            data-testid="merchant-identity-fields-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-muted-foreground">Business identity</h2>
                <dl className="mt-1 grid gap-1 text-sm">
                  <div className="flex items-center gap-2 text-foreground">
                    <span className="text-muted-foreground">Business name:</span>
                    <span data-testid="merchant-business-name-value">{data.merchant.businessName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <span className="text-muted-foreground">Trading name:</span>
                    <span data-testid="merchant-trading-name-value">{data.merchant.tradingName ?? 'Not set'}</span>
                  </div>
                  <div className="flex items-start gap-2 text-foreground">
                    <span className="shrink-0 text-muted-foreground">Description:</span>
                    <span data-testid="merchant-description-value">{data.merchant.description ?? 'Not set'}</span>
                  </div>
                </dl>
                {canProposeEdit && data.merchant.hasPendingIdentityEdit && (
                  <p
                    className="mt-2 text-xs text-muted-foreground"
                    data-testid="merchant-identity-pending-note"
                  >
                    An identity edit is already awaiting review. Action that request in the approval
                    queue before proposing another.
                  </p>
                )}
              </div>
              {canProposeEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: 'propose-edit' })}
                  disabled={data.merchant.hasPendingIdentityEdit}
                  data-testid="merchant-identity-propose"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Propose changes
                </Button>
              )}
            </div>
          </section>
```

5. Mount the dialog in the Dialogs block:

```tsx
      {dialog?.kind === 'propose-edit' && data && (
        <ProposeMerchantEditDialog
          merchantId={data.merchant.id}
          current={{
            businessName: data.merchant.businessName,
            tradingName: data.merchant.tradingName,
            description: data.merchant.description,
          }}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/admin-web && npx jest "app/(app)/merchants/[id]/__tests__/page.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin-web/app/(app)/merchants/[id]/page.tsx" "apps/admin-web/app/(app)/merchants/[id]/__tests__/page.test.tsx"
git commit -m "feat(admin-web): Business identity card + propose-edit wiring on /merchants/[id] (B2.5-web)"
```

---

## Task 7: full admin-web verification

**Files:** none (verification only).

- [ ] **Step 1: tsc**

Run: `cd apps/admin-web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: full jest suite**

Run: `cd apps/admin-web && npx jest`
Expected: all green (existing suites + the new/extended B2.5-web pins).

- [ ] **Step 3: next build (controller-run in the main checkout)**

Run: `cd apps/admin-web && npm run build`
Expected: 8/8 routes build (catches Next 15 prerender/Suspense issues tsc + jest miss). Per the `feedback_admin_web_next_build_verification` memory, worktree implementers cannot run this (missing `globals.css` artifact), so the controller runs it in the main checkout.

- [ ] **Step 4: style sweep**

Run: `git diff main..HEAD | grep -nP '\x{2014}'`
Expected: empty (no em-dashes). Also confirm no emojis and only real brand hexes in any added literals.

- [ ] **Step 5: scope guard**

Run: `git diff --stat main..HEAD`
Expected: every changed file under `apps/admin-web/**` plus this plan doc. No backend, no Prisma/schema, no customer-app/web changes.

---

## Self-review checklist

- **Spec coverage:** capability mirror (T1), schema fields + API (T2), hook (T3), dialog (T4), banner codes (T5), card + wiring (T6), verification (T7) cover every item in the owner's locked list.
- **Type consistency:** `ProposeMerchantEditInput` / `ProposeEditResponse` are defined in T2 and consumed by name in T3 and T4. `merchantDetailQueryKey` + `MERCHANTS_LIST_KEY` reused via `useInvalidateAfterEdit`. The `Dialog`, `Button`, `Input`, `NamedGateBanner` imports match existing dialogs.
- **Backend untouched:** no task edits `src/api/**` or `prisma/**`; the B1 applier is not referenced.
- **No clearing:** every changed-field comparison guards `!== ''` before send, matching the backend's non-empty-string-only route and the locked decision.
- **hasPendingIdentityEdit:** the button is disabled (not hidden) and the note renders only when the cap is held AND a pending edit exists, matching decision 6.

## Out of scope (do NOT touch)

B3 submit-on-behalf, B4 doc upload, B5 voucher co-build, Merchant Portal (Phase 4), B1 photo-apply, PR3 `branchCount`, the stash restore, and §B24-TIMELINE. Branch-identity propose (B2.5b) is also out of scope. No backend, schema, or Prisma changes (B2.5-core already shipped them).
