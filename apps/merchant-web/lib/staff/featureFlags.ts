// Staff & Access (v1) PR-C: client mirror of the backend SPECIFIC_BRANCHES_ENABLED
// gate (src/api/merchant/staff/service.ts:40, flipped TRUE in PR-B Task B7 once
// branch-scope enforcement coverage was complete). Per spec §5.2 / §7 #1 the UI must
// NEVER display a branch boundary the server does not enforce, so "Specific branches"
// is only rendered when this mirrors the backend's enabled state.
//
// This is a frontend mirror, not the source of truth: the backend re-validates a
// scoped invite (allBranches:false + branchIds) and refuses it when its own gate is
// off. If the backend flips this OFF again, this constant must flip with it in the
// same change (the backend would otherwise reject scoped invites the UI offers).
export const SPECIFIC_BRANCHES_ENABLED = true
