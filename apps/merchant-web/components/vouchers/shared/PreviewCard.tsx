'use client'

import * as React from 'react'
import { resolveCategoryKey } from '@/lib/voucher/config'
import {
  previewMechanic,
  previewSavingLine,
  fmtInterval,
  groupWindows,
  fmtTime,
} from '@/lib/voucher/builderCopy'
import {
  effectiveTitle,
  effectiveDescription,
  effectiveSaving,
  baseMechanicOf,
  selectedClausesFor,
  hasStructuredFields,
  REUSABLE_COOLDOWN_FLOOR,
  type BuilderState,
} from '../builder/builderModel'
import { TYPE_BANNER, TYPE_PILL } from './constants'

// Voucher Builder shared core: the live "How customers see your voucher" preview card.
// Anatomy verbatim from the prototype (FULL.html preview region + INVENTORY 4b):
// type-coloured header banner (or photo), type pill, headline, peach value chip, green
// save line, merchant identity row, body copy, TERMS list, gradient Redeem CTA. The
// TIME_LIMITED / REUSABLE state tabs (A2 / A4) render for the wrapper types. No
// customer PII is ever shown (lock 11): only the merchant's own name + branch label.

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function PreviewCard({
  state,
  categoryName,
  merchantName,
  branchLabel,
}: {
  state: BuilderState
  categoryName: string | null
  merchantName?: string | null
  branchLabel?: string | null
}) {
  const [timedTab, setTimedTab] = React.useState<'in' | 'later' | 'future'>('in')
  const [reuseTab, setReuseTab] = React.useState<'now' | 'waiting'>('now')

  const categoryKey = resolveCategoryKey(categoryName)
  const base = baseMechanicOf(state)
  const configured = hasStructuredFields(state)
  const title = effectiveTitle(state)
  const description = effectiveDescription(state)
  const saving = effectiveSaving(state)
  const pill = TYPE_PILL[state.pickerId]
  const banner = TYPE_BANNER[state.pickerId]
  const avatar = (merchantName ?? 'Your business').slice(0, 2).toUpperCase()

  // Wrapper Step-1 empty state.
  if (base == null || !configured) {
    return (
      <div className="rounded-[16px] border border-[#E5E7EB] bg-[#FFF9F5] p-5 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8089A4]">How customers see your voucher</p>
        <p className="mt-3 text-sm font-semibold text-[#010C35]">Pick what runs first</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6B7390]">
          Choose the voucher in Step 1, then your live customer preview appears here.
        </p>
      </div>
    )
  }

  const valueChip = previewMechanic(base, state.fields)
  const saveLine = previewSavingLine(base, state.fields, saving)
  const terms = selectedClausesFor(state, categoryKey).map((c) => c.label).concat(state.customTerms.map((c) => c.text))

  const isTimed = state.pickerId === 'time'
  const isReusable = state.pickerId === 'reusable'
  const groups = groupWindows(state.availabilityWindows)
  const w0 = groups[0]
  const cooldown = state.cooldownSeconds ?? REUSABLE_COOLDOWN_FLOOR
  const intervalText = fmtInterval(cooldown)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[#8089A4]">How customers see your voucher</p>

      <div data-testid="builder-preview" className="overflow-hidden rounded-[16px] border border-[#E5E7EB] bg-white shadow-[var(--shadow-sm)]">
        {/* Header banner */}
        <div
          className="relative flex h-24 items-end p-3.5"
          style={state.imageUrl ? { backgroundImage: `url("${state.imageUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: banner }}
        >
          <span className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#010C35]">{pill}</span>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-white">
            <span className="flex size-6 items-center justify-center rounded-full bg-white/30 text-[10px] font-bold text-white">{avatar}</span>
            on Redeemo
          </span>
        </div>

        <div className="flex flex-col gap-2 p-4">
          <p data-testid="builder-preview-title" className="font-display text-lg font-semibold text-[#010C35]">
            {title || 'Your voucher title appears here'}
          </p>
          {valueChip ? (
            <span className="w-fit rounded-full bg-[#FEF0EE] px-2.5 py-1 text-[12px] font-semibold text-[#B4341C]">{valueChip}</span>
          ) : null}
          <p data-testid="builder-preview-saving" className="text-sm font-semibold text-[#16A34A]">{saveLine}</p>

          {/* Merchant identity row (merchant's own data only; no customer PII). */}
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-[#010C35] text-[10px] font-bold text-white">{avatar}</span>
            <span className="text-[12px] font-semibold text-[#4B5366]">
              {merchantName ?? 'Your business'}
              {branchLabel ? `, ${branchLabel}` : ''}
            </span>
          </div>

          <p data-testid="builder-preview-description" className="text-sm leading-relaxed text-[#4B5366]">
            {description || 'A short description of the offer appears here.'}
          </p>

          {/* Wrapper state tabs + status box (A2 / A4). */}
          {isTimed ? (
            <TimedStatus tab={timedTab} onTab={setTimedTab} closeTime={w0 ? fmtTime(w0.closeTime) : ''} openTime={w0 ? fmtTime(w0.openTime) : ''} nextDay={w0 && w0.days.length ? DAY_LONG[[...w0.days].sort((a, b) => a - b)[0]] : ''} />
          ) : null}
          {isReusable ? <ReuseStatus tab={reuseTab} onTab={setReuseTab} intervalText={intervalText} /> : null}

          {terms.length > 0 ? (
            <div className="mt-1 border-t border-[#F1ECE6] pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#8089A4]">Terms</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] leading-relaxed text-[#6B7390]">
                {terms.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* CTA (verbatim wrapper casing per A9). */}
          <PreviewCta isTimed={isTimed} isReusable={isReusable} timedTab={timedTab} reuseTab={reuseTab} intervalText={intervalText} openTime={w0 ? fmtTime(w0.openTime) : ''} />
        </div>
      </div>

      <p className="text-[11px] text-[#8089A4]">Updates live as you change the voucher.</p>
    </div>
  )
}

function TimedStatus({
  tab,
  onTab,
  closeTime,
  openTime,
  nextDay,
}: {
  tab: 'in' | 'later' | 'future'
  onTab: (t: 'in' | 'later' | 'future') => void
  closeTime: string
  openTime: string
  nextDay: string
}) {
  const tabs: Array<{ id: 'in' | 'later' | 'future'; label: string }> = [
    { id: 'in', label: 'In window' },
    { id: 'later', label: 'Later today' },
    { id: 'future', label: 'Future day' },
  ]
  const box =
    tab === 'in'
      ? { pill: 'AVAILABLE NOW', line: closeTime ? `Window ends ${closeTime}` : 'Available during the times you set' }
      : tab === 'later'
        ? { pill: 'AVAILABLE LATER TODAY', line: openTime ? `Available from ${openTime}` : 'Available later today' }
        : { pill: `AVAILABLE ${nextDay ? nextDay.toUpperCase() : 'SOON'}`, line: openTime ? `Available from ${openTime}` : 'Available on the next scheduled day' }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={
              t.id === tab
                ? 'flex-1 rounded-[8px] bg-[#010C35] py-1 text-[11px] font-bold text-white'
                : 'flex-1 rounded-[8px] bg-[#F3F4F6] py-1 text-[11px] font-bold text-[#6B7390]'
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-[10px] border border-[#F3D8AE] bg-[#FEF6EC] p-2.5">
        <span className="rounded-full bg-[#F4D072] px-2 py-0.5 text-[10px] font-bold text-[#5A3A0C]">{box.pill}</span>
        <p className="mt-1 text-[12px] font-semibold text-[#8A5A16]">{box.line}</p>
      </div>
    </div>
  )
}

function ReuseStatus({
  tab,
  onTab,
  intervalText,
}: {
  tab: 'now' | 'waiting'
  onTab: (t: 'now' | 'waiting') => void
  intervalText: string
}) {
  const tabs: Array<{ id: 'now' | 'waiting'; label: string }> = [
    { id: 'now', label: 'Available now' },
    { id: 'waiting', label: 'Used, now waiting' },
  ]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={
              t.id === tab
                ? 'flex-1 rounded-[8px] bg-[#010C35] py-1 text-[11px] font-bold text-white'
                : 'flex-1 rounded-[8px] bg-[#F3F4F6] py-1 text-[11px] font-bold text-[#6B7390]'
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-[10px] border border-[#BFE6D6] bg-[#EAF8F3] p-2.5">
        <span className="rounded-full bg-[#43B79C] px-2 py-0.5 text-[10px] font-bold text-white">
          {tab === 'now' ? 'AVAILABLE NOW' : 'AVAILABLE AGAIN'}
        </span>
        <p className="mt-1 text-[12px] font-semibold text-[#0F6357]">
          {tab === 'now'
            ? `Available again every ${intervalText}. Your subscription must stay active to redeem.`
            : `Available again every ${intervalText}.`}
        </p>
      </div>
    </div>
  )
}

function PreviewCta({
  isTimed,
  isReusable,
  timedTab,
  reuseTab,
  intervalText,
  openTime,
}: {
  isTimed: boolean
  isReusable: boolean
  timedTab: 'in' | 'later' | 'future'
  reuseTab: 'now' | 'waiting'
  intervalText: string
  openTime: string
}) {
  if (isTimed && timedTab !== 'in') {
    return (
      <div className="mt-1 flex h-11 flex-col items-center justify-center rounded-[12px] bg-[#E7E9ED] text-center">
        <span className="text-[13px] font-bold text-[#8089A4]">Not Available Right Now</span>
        {openTime ? <span className="text-[11px] text-[#8089A4]">Available from {openTime}</span> : null}
      </div>
    )
  }
  if (isReusable && reuseTab === 'waiting') {
    return (
      <div className="mt-1 flex h-11 items-center justify-center rounded-[12px] bg-[#E7E9ED] text-[13px] font-bold text-[#8089A4]">
        Available again in {intervalText}
      </div>
    )
  }
  // Wrapper in-window / available CTA uses title case (A9); base types sentence case.
  const label = isTimed || isReusable ? 'Redeem This Voucher' : 'Redeem this voucher'
  return (
    <button
      type="button"
      disabled
      className="mt-1 h-11 rounded-[12px] border-0 bg-[linear-gradient(135deg,#E20C04_0%,#E84A00_100%)] text-[13px] font-bold text-white"
    >
      {label}
    </button>
  )
}
