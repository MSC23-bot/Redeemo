'use client'

import { useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import type { OnboardingContract } from '@/lib/api/onboarding'

// M2 F6: the "Sign the merchant agreement" step. The final onboarding step. Pure
// presentational form: it takes the fetched contract (version + text), the signer's
// business name, an optional name prefill, and the accept / back callbacks. The page
// owns the fetch, the POST /onboarding/contract/accept, the cache invalidation, and
// the route back to the F1 hub.
//
// Click-to-agree gate (owner-by-absence in M2; the explicit OWNER role-gate is M3):
// the "Agree and continue" CTA enables ONLY when the checkbox is ticked AND a
// non-blank name has been typed (`agreeChecked && signerName.trim()`). The typed
// name + the read-only date are UI/legal affordances; the accept POST only carries
// the version.

// The 6 key terms, in plain English. Verbatim from the prototype (the binding
// version is owned by the backend contract text, surfaced in the full-agreement
// modal). Icons are inline SVG path data to avoid a barrel import.
const KEY_TERMS: { icon: string; text: string }[] = [
  {
    icon: 'M7 3v3M17 3v3M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1M4 10h16',
    text: 'This is a 12 month agreement between your business and Redeemo.',
  },
  {
    icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    text: 'Listing is free. You only pay for optional featured placement and campaigns.',
  },
  {
    icon: 'M9 12l2 2 4-4M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z',
    text: 'You agree to honour the vouchers you publish and to keep your information accurate.',
  },
  {
    icon: 'M3 7h10v8H3ZM13 10h4l4 4v1h-8M7 18a2 2 0 1 0 4 0M16 18a2 2 0 1 0 4 0',
    text: 'Customers redeem in person at your branch, and your team validates each redemption.',
  },
  {
    icon: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7ZM9 12l2 2 4-4',
    text: 'Redeemo may review, suspend, or remove listings that break the rules or fall short on quality, to protect customers and merchants.',
  },
  {
    icon: 'M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5M9 10V7a3 3 0 0 1 6 0v3',
    text: 'Your data is handled under the Redeemo Privacy Policy, and you are responsible for your staff use of the portal.',
  },
]

const DRAFT_NOTICE = 'Draft for review. The binding version will be confirmed by Redeemo legal team before launch.'

interface ContractAgreementFormProps {
  contract: OnboardingContract
  /** The merchant's registered business name (the party the owner signs for). */
  signerBusinessName: string
  /** Optional prefill for the typed-name signature (the owner's name if known). */
  signerName?: string
  /** True once the contract is signed: shows the signed-confirmation state. */
  signed: boolean
  /** True while the accept POST is in flight. */
  accepting: boolean
  /** Inline accept-error message, or null. */
  acceptError: string | null
  onAccept: () => void
  onBack: () => void
}

function formatTodayLabel(): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const now = new Date()
  return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`
}

export function ContractAgreementForm({
  contract,
  signerBusinessName,
  signerName = '',
  signed,
  accepting,
  acceptError,
  onAccept,
  onBack,
}: ContractAgreementFormProps) {
  const [agreeChecked, setAgreeChecked] = useState(false)
  const [name, setName] = useState(signerName)
  const [fullOpen, setFullOpen] = useState(false)

  const dateLabel = useMemo(() => formatTodayLabel(), [])
  const canSign = agreeChecked && name.trim().length > 0

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#FFFFFF_0%,#FFF6F1_100%)] text-[#010C35]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-3.5 border-b border-[#EEF1F4] bg-white/90 px-5 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-[38px] items-center gap-1.5 rounded-[10px] border border-[#E5E7EB] bg-white pl-2.5 pr-3 text-[13px] font-bold text-[#455373] transition-colors hover:bg-[#F8F9FA]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back to dashboard
        </button>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-[20px] bg-[#FEF0EE] px-3 text-[12px] font-extrabold uppercase tracking-wider text-[#E84A00]">
          <span className="size-1.5 rounded-full bg-[#E84A00]" aria-hidden="true" />
          Setup step 6 of 6
        </span>
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-[720px] flex-1 px-7 pb-20 pt-9">
        {signed ? (
          <SignedConfirmation
            businessName={signerBusinessName}
            signerName={name.trim() || signerName}
            dateLabel={dateLabel}
          />
        ) : (
          <>
            <div>
              <h1 className="font-display text-[36px] font-semibold leading-[1.1] tracking-tight text-[#010C35]">
                Sign the merchant agreement
              </h1>
              <p className="mt-3.5 max-w-[56ch] text-[16px] leading-relaxed text-[#566079]">
                A quick read and a tick. Only the business owner can sign this.
              </p>
            </div>

            {/* Key terms card */}
            <section className="mt-7 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
              <div className="text-[12px] font-extrabold uppercase tracking-wider text-[#E84A00]">
                The key terms, in plain English
              </div>
              <ul className="mt-[18px] flex flex-col gap-4">
                {KEY_TERMS.map((term) => (
                  <li key={term.text} className="flex items-start gap-3.5">
                    <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-[#FBE9E1] bg-[#FFF6F1] text-[#E20C04]">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={term.icon} />
                      </svg>
                    </span>
                    <span className="pt-1 text-[14.5px] leading-relaxed text-[#1F2A4A]">{term.text}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setFullOpen(true)}
                className="mt-[22px] inline-flex h-10 items-center gap-1.5 rounded-[11px] border border-[#E5E7EB] bg-white px-4 text-[13.5px] font-bold text-[#010C35] transition-colors hover:border-[#D7DBE2] hover:bg-[#F8F9FA]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 3.5H7a1.8 1.8 0 0 0-1.8 1.8v13.4A1.8 1.8 0 0 0 7 20.5h10a1.8 1.8 0 0 0 1.8-1.8V8.3ZM14 3.5v5h4.8M9 13h6M9 16.5h4" />
                </svg>
                Read the full agreement
              </button>
            </section>

            {/* Signer + signing block */}
            <section className="mt-6 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
              {/* Signer identity */}
              <div className="flex items-center gap-3.5 border-b border-[#F3F4F6] pb-5">
                <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[13px] bg-[linear-gradient(135deg,#010C35,#1d2554)] text-[16px] font-extrabold text-white">
                  {initials(signerBusinessName)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[16px] font-extrabold text-[#010C35]">{signerBusinessName}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C7ECD5] bg-[#E9F7EF] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#0F7A3E]">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12l5 5 9-11" />
                      </svg>
                      Owner
                    </span>
                  </div>
                  <div className="mt-0.5 text-[13.5px] text-[#566079]">
                    Signing as the owner of {signerBusinessName}.
                  </div>
                </div>
              </div>

              {/* Agree checkbox */}
              <label className="mt-5 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  aria-label="I have read and agree to the Redeemo Merchant Agreement"
                  checked={agreeChecked}
                  onChange={(e) => setAgreeChecked(e.target.checked)}
                  className="mt-0.5 size-[18px] shrink-0 accent-[#E20C04]"
                />
                <span className="text-[14px] leading-relaxed text-[#1F2A4A]">
                  I have read and agree to the Redeemo Merchant Agreement on behalf of my business, and I am
                  authorised to sign it.
                </span>
              </label>

              {/* Name + date */}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-bold text-[#3A465F]">Type your full name to sign</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="James Whitfield"
                    autoComplete="name"
                    className="h-[50px] rounded-[12px] border-[1.5px] border-[#E3E7EE] bg-[#FCFCFD] px-4 font-display text-[16px] font-semibold tracking-[0.2px] text-[#010C35] outline-none focus:border-[#E20C04] focus:bg-white"
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-bold text-[#3A465F]">Date of agreement</span>
                  <div className="flex h-[50px] items-center gap-2.5 rounded-[12px] border-[1.5px] border-[#E3E7EE] bg-[#F8F9FB] px-4 text-[15px] font-semibold text-[#566079]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8089A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 3v3M17 3v3M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1M4 10h16" />
                    </svg>
                    {dateLabel}
                  </div>
                </div>
              </div>

              {acceptError ? (
                <p role="alert" className="mt-4 text-[13px] font-semibold text-[#B91C1C]">
                  {acceptError}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <span className="max-w-[42ch] text-[12px] leading-relaxed text-[#8089A4]">{DRAFT_NOTICE}</span>
                <button
                  type="button"
                  disabled={!canSign || accepting}
                  onClick={() => {
                    if (canSign && !accepting) onAccept()
                  }}
                  className="inline-flex h-[52px] items-center justify-center rounded-[13px] px-8 text-[15.5px] font-extrabold text-white transition-transform enabled:bg-[linear-gradient(135deg,#E20C04_0%,#E84A00_100%)] enabled:shadow-[0_14px_30px_-12px_rgba(226,12,4,0.6)] enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:bg-[#EBD9D3]"
                >
                  {accepting ? 'Signing...' : 'Agree and continue'}
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Full agreement modal: the fetched backend text + the draft banner. */}
      {fullOpen ? (
        <Dialog
          label="Redeemo Merchant Agreement"
          onClose={() => setFullOpen(false)}
          panelTestId="full-agreement-panel"
          scrimTestId="full-agreement-scrim"
        >
          <div className="flex max-h-[84vh] w-full max-w-[680px] flex-col">
            <div className="flex items-center justify-between gap-3.5 border-b border-[#F3F4F6] pb-4">
              <h3 className="font-display text-[19px] font-semibold text-[#010C35]">Redeemo Merchant Agreement</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setFullOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[#E5E7EB] bg-white text-[#455373] transition-colors hover:bg-[#F8F9FA]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="mt-4 overflow-y-auto pr-1">
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[#F4D9A8] bg-[#FEF6E7] px-3 py-1.5 text-[12px] font-bold text-[#B45309]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
                {DRAFT_NOTICE}
              </div>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#455373]">{contract.text}</p>
            </div>
            <div className="mt-4 flex shrink-0 items-center justify-end border-t border-[#F3F4F6] pt-4">
              <button
                type="button"
                onClick={() => setFullOpen(false)}
                className="h-11 rounded-[12px] bg-[#010C35] px-6 text-[14px] font-bold text-white transition-colors hover:bg-[#1d2554]"
              >
                Done
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

function SignedConfirmation({
  businessName,
  signerName,
  dateLabel,
}: {
  businessName: string
  signerName: string
  dateLabel: string
}) {
  return (
    <>
      <div className="flex flex-col items-center pt-4 text-center">
        <span className="flex size-[74px] items-center justify-center rounded-full border border-[#C7ECD5] bg-[#E9F7EF] text-[#0F7A3E]">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h1 className="mt-5 font-display text-[34px] font-semibold leading-[1.12] tracking-tight text-[#010C35]">
          Your agreement is signed
        </h1>
        <p className="mt-3 max-w-[50ch] text-[16px] leading-relaxed text-[#566079]">
          Thank you. We have recorded your signed Redeemo Merchant Agreement. We are taking you back to your setup
          so you can finish and submit your business for review.
        </p>
      </div>

      <div className="mt-7 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
        <div className="text-[12px] font-extrabold uppercase tracking-wider text-[#0F7A3E]">Signed confirmation</div>
        <div className="mt-4 grid gap-y-4 gap-x-6 sm:grid-cols-3">
          <ConfirmCell label="Business" value={businessName} />
          <ConfirmCell label="Signed by" value={signerName || businessName} />
          <ConfirmCell label="Date of agreement" value={dateLabel} hint="12 month term" />
        </div>
      </div>
    </>
  )
}

function ConfirmCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[12px] font-bold uppercase tracking-wide text-[#8089A4]">{label}</div>
      <div className="mt-1 text-[15px] font-bold text-[#010C35]">{value}</div>
      {hint ? <div className="mt-0.5 text-[13px] text-[#566079]">{hint}</div> : null}
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
