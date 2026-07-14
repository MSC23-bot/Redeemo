// src/api/customer/invites/flags.ts
//
// M0 of the customer merchant-invite programme. Two independent feature
// flags, both default OFF (dark-by-default house convention — mirrors
// isEmailEnabled / isStorageEnabled / isModerationEnabled in ../../shared/):
//   - INVITES_ENABLED        gates the customer-facing invite surface (the
//                             submit-invite route/service is reachable at all).
//   - INVITE_REWARDS_ENABLED gates the reward hook (Phase 1 has no reward
//                             issuance wired up yet; this flag exists so the
//                             later reward-grant work can ship dark and be
//                             flipped on independently of the invite surface).
//
// No entry in FEATURE_GATED_SECRETS (src/api/shared/env.ts): Phase 1 needs no
// secret (no Places API key, no payment provider) behind either flag.

export const isInvitesEnabled = (): boolean => (process.env.INVITES_ENABLED ?? '') === 'true'
export const isInviteRewardsEnabled = (): boolean => (process.env.INVITE_REWARDS_ENABLED ?? '') === 'true'
