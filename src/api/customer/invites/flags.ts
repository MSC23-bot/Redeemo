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
// No entry in FEATURE_GATED_SECRETS (src/api/shared/env.ts). Note (F5,
// adversarial review): M1 place-search DOES call the billable Google Places
// wrapper when INVITES_ENABLED is on; a missing GOOGLE_MAPS_API_KEY degrades
// gracefully to an empty candidate list (free-text fallback), so the key is
// desirable-but-not-required rather than a boot-blocking gated secret.

export const isInvitesEnabled = (): boolean => (process.env.INVITES_ENABLED ?? '') === 'true'
export const isInviteRewardsEnabled = (): boolean => (process.env.INVITE_REWARDS_ENABLED ?? '') === 'true'
