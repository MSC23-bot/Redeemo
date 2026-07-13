// Voucher Builder shared prototype-fidelity core (S1). Consumed by the day-2 custom
// builder (components/vouchers/builder/*) now; the onboarding flagship lane adopts it
// in S2. See docs/superpowers/plans/2026-07-13-voucher-builder-prototype-fidelity.md.
export { TypePicker, BaseMechanicPicker } from './TypePicker'
export { MechanicFields, ScheduleFields, CooldownFields } from './BuilderFields'
export { WhatCustomersSee } from './WhatCustomersSee'
export { TermsComposer } from './TermsComposer'
export { ScorePanel } from './ScorePanel'
export { PreviewCard } from './PreviewCard'
export { SubmitConfirmModal } from './SubmitConfirmModal'
export { buildScoreInput } from './scoreInput'
export * from './primitives'
export * from './constants'
