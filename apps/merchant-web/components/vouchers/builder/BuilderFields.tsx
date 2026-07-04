'use client'

import * as React from 'react'
import type { CategoryKey } from '@/lib/voucher/config'
import {
  buySuggestChips,
  freeBogoChips,
  freebieItemChips,
  freeQualifyChips,
  freebieWorthChips,
  spendChips,
  saveChips,
  discountAmountChips,
  discountPercentChips,
  discountTypicalOrderChips,
  discountMinSpendChips,
  packageItemChips,
  packagePriceChips,
  packageNormalChips,
} from '@/lib/voucher/config'
import type { DraftFields } from '@/lib/voucher/compose'
import { FieldBlock, SuggestionChips, TextField, MoneyField, Segmented, toNum } from './fields'
import {
  REUSABLE_COOLDOWN_FLOOR,
  type BuilderState,
  isStructuredPickerId,
} from './builderModel'
import type { AvailabilityWindow } from '@/lib/api/voucher'

// Day-2 Vouchers B2: the per-type guided fields. The structured 5 types drive the
// DraftFields bag (consumed by lib/voucher/compose + scoring). TIME_LIMITED renders
// an availability-window editor; REUSABLE renders a cooldown control. All field
// chips/labels come from lib/voucher/config (the validated logic).

interface FieldsProps {
  state: BuilderState
  categoryKey: CategoryKey
  onFields: (patch: Partial<DraftFields>) => void
  onWindows: (windows: AvailabilityWindow[]) => void
  onCooldown: (seconds: number) => void
  onExpiryDate: (date: string | undefined) => void
}

export function BuilderFields(props: FieldsProps) {
  const { state, categoryKey } = props
  if (state.pickerId === 'time') return <TimeLimitedFields {...props} />
  if (state.pickerId === 'reusable') return <ReusableFields {...props} />
  if (!isStructuredPickerId(state.pickerId)) return null

  switch (state.pickerId) {
    case 'bogo':
      return <BogoFields {...props} categoryKey={categoryKey} />
    case 'spend':
      return <SpendFields {...props} categoryKey={categoryKey} />
    case 'discount':
      return <DiscountFields {...props} />
    case 'freebie':
      return <FreebieFields {...props} categoryKey={categoryKey} />
    case 'package':
      return <PackageFields {...props} categoryKey={categoryKey} />
    default:
      return null
  }
}

const numStr = (n: number | undefined) => (typeof n === 'number' ? String(n) : '')

function BogoFields({ state, categoryKey, onFields }: FieldsProps) {
  const f = state.fields
  return (
    <div className="flex flex-col gap-5">
      <FieldBlock heading="What do they buy?" helper="The item they pay full price for.">
        <SuggestionChips chips={buySuggestChips(categoryKey)} onPick={(v) => onFields({ bogoBuy: v })} />
        <TextField label="Buy item" hideLabel value={f.bogoBuy ?? ''} onChange={(v) => onFields({ bogoBuy: v })} placeholder="e.g. A main" />
        <MoneyField label="Its full price" value={numStr(f.bogoBuyFullPrice)} onChange={(v) => onFields({ bogoBuyFullPrice: toNum(v) })} />
      </FieldBlock>
      <FieldBlock heading="What do they get free?">
        <SuggestionChips chips={freeBogoChips()} onPick={(v) => onFields({ bogoFree: v })} />
        <TextField label="Free item" hideLabel value={f.bogoFree ?? ''} onChange={(v) => onFields({ bogoFree: v })} placeholder="e.g. A second item" />
        <MoneyField label="Its value" value={numStr(f.bogoFreePrice)} onChange={(v) => onFields({ bogoFreePrice: toNum(v) })} />
      </FieldBlock>
    </div>
  )
}

function SpendFields({ state, categoryKey, onFields }: FieldsProps) {
  const f = state.fields
  return (
    <div className="flex flex-col gap-5">
      <FieldBlock heading="How much do they spend?">
        <SuggestionChips chips={spendChips(categoryKey)} prefix="£" onPick={(v) => onFields({ spendAmount: toNum(v) })} />
        <MoneyField label="Spend amount" value={numStr(f.spendAmount)} onChange={(v) => onFields({ spendAmount: toNum(v) })} />
      </FieldBlock>
      <FieldBlock heading="How much do they save?">
        <SuggestionChips chips={saveChips(categoryKey)} prefix="£" onPick={(v) => onFields({ spendSave: toNum(v) })} />
        <MoneyField label="Save amount" value={numStr(f.spendSave)} onChange={(v) => onFields({ spendSave: toNum(v) })} />
      </FieldBlock>
    </div>
  )
}

function DiscountFields({ state, onFields }: FieldsProps) {
  const f = state.fields
  const kind = f.discountKind ?? 'percent'
  return (
    <div className="flex flex-col gap-5">
      <FieldBlock heading="Fixed amount or a percentage?">
        <Segmented
          ariaLabel="Discount kind"
          value={kind}
          onChange={(v) => onFields({ discountKind: v })}
          options={[
            { value: 'percent', label: 'A percentage' },
            { value: 'fixed', label: 'A fixed amount' },
          ]}
        />
      </FieldBlock>
      {kind === 'fixed' ? (
        <FieldBlock heading="How much off?">
          <SuggestionChips chips={discountAmountChips()} prefix="£" onPick={(v) => onFields({ discAmount: toNum(v) })} />
          <MoneyField label="Amount off" value={numStr(f.discAmount)} onChange={(v) => onFields({ discAmount: toNum(v) })} />
        </FieldBlock>
      ) : (
        <>
          <FieldBlock heading="What percentage off?">
            <SuggestionChips chips={discountPercentChips()} onPick={(v) => onFields({ discPercent: toNum(v) })} />
            <MoneyField label="Percent off" unit="%" unitTrailing value={numStr(f.discPercent)} onChange={(v) => onFields({ discPercent: toNum(v) })} />
          </FieldBlock>
          <FieldBlock heading="A typical order total" helper="Used to estimate the saving.">
            <SuggestionChips chips={discountTypicalOrderChips()} prefix="£" onPick={(v) => onFields({ discTypicalOrder: toNum(v) })} />
            <MoneyField label="Typical order" value={numStr(f.discTypicalOrder)} onChange={(v) => onFields({ discTypicalOrder: toNum(v) })} />
          </FieldBlock>
        </>
      )}
      <FieldBlock heading="Minimum spend (optional)">
        <SuggestionChips chips={discountMinSpendChips()} prefix="£" onPick={(v) => onFields({ discMin: toNum(v) })} />
        <MoneyField label="Minimum spend" value={numStr(f.discMin)} onChange={(v) => onFields({ discMin: toNum(v) })} />
      </FieldBlock>
    </div>
  )
}

function FreebieFields({ state, categoryKey, onFields }: FieldsProps) {
  const f = state.fields
  const needsPurchase = f.freeNeedsPurchase ?? false
  return (
    <div className="flex flex-col gap-5">
      <FieldBlock heading="What is the free item?">
        <SuggestionChips chips={freebieItemChips(categoryKey)} onPick={(v) => onFields({ freeItem: v })} />
        <TextField label="Free item" hideLabel value={f.freeItem ?? ''} onChange={(v) => onFields({ freeItem: v })} placeholder="e.g. A coffee" />
      </FieldBlock>
      <FieldBlock heading="What is it worth?">
        <SuggestionChips chips={freebieWorthChips()} prefix="£" onPick={(v) => onFields({ freeWorth: toNum(v) })} />
        <MoneyField label="Worth" value={numStr(f.freeWorth)} onChange={(v) => onFields({ freeWorth: toNum(v) })} />
      </FieldBlock>
      <FieldBlock heading="Does it need a purchase?">
        <Segmented
          ariaLabel="Needs purchase"
          value={needsPurchase ? 'yes' : 'no'}
          onChange={(v) => onFields({ freeNeedsPurchase: v === 'yes' })}
          options={[
            { value: 'no', label: 'No, on its own' },
            { value: 'yes', label: 'Yes, with a purchase' },
          ]}
        />
      </FieldBlock>
      {needsPurchase ? (
        <FieldBlock heading="What qualifies?">
          <SuggestionChips chips={freeQualifyChips(categoryKey)} onPick={(v) => onFields({ freeQualify: v })} />
          <TextField label="Qualifying purchase" hideLabel value={f.freeQualify ?? ''} onChange={(v) => onFields({ freeQualify: v })} placeholder="e.g. Any main" />
        </FieldBlock>
      ) : null}
    </div>
  )
}

function PackageFields({ state, categoryKey, onFields }: FieldsProps) {
  const f = state.fields
  return (
    <div className="flex flex-col gap-5">
      <FieldBlock heading="What is in the package?">
        <SuggestionChips chips={packageItemChips(categoryKey)} onPick={(v) => onFields({ packageItems: v })} />
        <TextField label="Package items" hideLabel value={f.packageItems ?? ''} onChange={(v) => onFields({ packageItems: v })} placeholder="e.g. A starter, main and dessert" />
      </FieldBlock>
      <FieldBlock heading="The package price">
        <SuggestionChips chips={packagePriceChips()} prefix="£" onPick={(v) => onFields({ packagePrice: toNum(v) })} />
        <MoneyField label="Package price" value={numStr(f.packagePrice)} onChange={(v) => onFields({ packagePrice: toNum(v) })} />
      </FieldBlock>
      <FieldBlock heading="The normal total" helper="What these would cost separately.">
        <SuggestionChips chips={packageNormalChips()} prefix="£" onPick={(v) => onFields({ packageNormal: toNum(v) })} />
        <MoneyField label="Normal total" value={numStr(f.packageNormal)} onChange={(v) => onFields({ packageNormal: toNum(v) })} />
      </FieldBlock>
    </div>
  )
}

// --- TIME_LIMITED ------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// V1 quick-start presets (prototype parity): one tap seeds a common window set;
// the rows stay fully editable afterwards.
const WINDOW_PRESETS: Array<{ label: string; windows: AvailabilityWindow[] }> = [
  {
    label: 'Weekday lunchtimes',
    windows: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, openTime: '12:00', closeTime: '14:30' })),
  },
  {
    label: 'Weekday early evenings',
    windows: [1, 2, 3, 4].map((d) => ({ dayOfWeek: d, openTime: '17:00', closeTime: '19:00' })),
  },
  {
    label: 'Weekend mornings',
    windows: [6, 0].map((d) => ({ dayOfWeek: d, openTime: '10:00', closeTime: '12:00' })),
  },
]

function TimeLimitedFields({ state, onWindows, onExpiryDate }: FieldsProps) {
  const windows = state.availabilityWindows
  const hasEndDate = typeof state.expiryDate === 'string' && state.expiryDate.length > 0
  function addWindow() {
    onWindows([...windows, { dayOfWeek: 1, openTime: '14:00', closeTime: '17:00' }])
  }
  function patchWindow(idx: number, patch: Partial<AvailabilityWindow>) {
    onWindows(windows.map((w, i) => (i === idx ? { ...w, ...patch } : w)))
  }
  function removeWindow(idx: number) {
    onWindows(windows.filter((_, i) => i !== idx))
  }
  return (
    <div className="flex flex-col gap-4">
      <FieldBlock
        heading="When is the offer available?"
        helper="Add one or more day-and-time windows. Customers can only redeem inside a window."
      >
        <div className="flex flex-col gap-3">
          {windows.length === 0 ? (
            <div className="flex flex-wrap gap-2" data-testid="window-presets">
              {WINDOW_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onWindows(p.windows)}
                  className="inline-flex h-9 items-center rounded-full border border-[#D7DBE2] bg-white px-3.5 text-[13px] font-semibold text-[#1F2A4A] hover:border-[#E20C04] hover:bg-[#FEF6F5]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          ) : null}
          {windows.map((w, idx) => (
            <div key={idx} className="flex flex-wrap items-end gap-2 rounded-[12px] border border-[#E5E7EB] bg-white p-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-[#010C35]">
                Day
                <select
                  aria-label={`Window ${idx + 1} day`}
                  value={w.dayOfWeek}
                  onChange={(e) => patchWindow(idx, { dayOfWeek: Number(e.target.value) })}
                  className="h-9 rounded-[10px] border border-[#D1D5DB] bg-white px-2 text-sm text-[#010C35]"
                >
                  {DAY_NAMES.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-[#010C35]">
                Opens
                <input
                  aria-label={`Window ${idx + 1} open time`}
                  type="time"
                  value={w.openTime}
                  onChange={(e) => patchWindow(idx, { openTime: e.target.value })}
                  className="h-9 rounded-[10px] border border-[#D1D5DB] bg-white px-2 text-sm text-[#010C35]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-[#010C35]">
                Closes
                <input
                  aria-label={`Window ${idx + 1} close time`}
                  type="time"
                  value={w.closeTime}
                  onChange={(e) => patchWindow(idx, { closeTime: e.target.value })}
                  className="h-9 rounded-[10px] border border-[#D1D5DB] bg-white px-2 text-sm text-[#010C35]"
                />
              </label>
              <button
                type="button"
                onClick={() => removeWindow(idx)}
                className="ml-auto h-9 rounded-[10px] border border-[#E5E7EB] px-3 text-xs font-semibold text-[#6B7390] hover:bg-[#F8F9FA]"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addWindow}
            className="inline-flex h-10 w-fit items-center rounded-[12px] border border-[#D7DBE2] bg-white px-4 text-[13px] font-semibold text-[#1F2A4A] hover:bg-[#F8F9FA]"
          >
            Add a time window
          </button>
        </div>
      </FieldBlock>

      {/* V1: an explicit end-date affordance for the EXISTING generic expiryDate
          field (prototype parity - previously reachable only via prefill). */}
      <FieldBlock heading="Does this offer end on a date?" helper="Optional. Leave off and the offer runs until you end it.">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[#010C35]">
            <input
              type="checkbox"
              checked={hasEndDate}
              onChange={(e) => {
                // Seed from the LOCAL calendar date (en-CA = YYYY-MM-DD), not the
                // UTC date, so early-hours UTC+ users do not see yesterday.
                onExpiryDate(e.target.checked ? new Date().toLocaleDateString('en-CA') : undefined)
              }}
              className="size-4 accent-[#E20C04]"
            />
            Ends on a date
          </label>
          {hasEndDate ? (
            <input
              type="date"
              aria-label="End date"
              value={(state.expiryDate ?? '').slice(0, 10)}
              onChange={(e) => onExpiryDate(e.target.value || undefined)}
              className="h-9 rounded-[10px] border border-[#D1D5DB] bg-white px-2 text-sm text-[#010C35]"
            />
          ) : null}
        </div>
      </FieldBlock>
    </div>
  )
}

// --- REUSABLE ----------------------------------------------------------------

const COOLDOWN_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 86400, label: '1 day' },
  { value: 604800, label: '1 week' },
]

const CUSTOM_UNITS: Array<{ id: 'hours' | 'days' | 'weeks'; label: string; seconds: number }> = [
  { id: 'hours', label: 'hours', seconds: 3600 },
  { id: 'days', label: 'days', seconds: 86400 },
  { id: 'weeks', label: 'weeks', seconds: 604800 },
]

function ReusableFields({ state, onCooldown }: FieldsProps) {
  const current = state.cooldownSeconds ?? REUSABLE_COOLDOWN_FLOOR
  const presetActive = COOLDOWN_OPTIONS.some((o) => o.value === current)
  // V1 custom interval (prototype parity): "every N unit" beyond the presets.
  // The floor stays server-validated; the UI clamps for fast feedback.
  const [customN, setCustomN] = React.useState('2')
  const [customUnit, setCustomUnit] = React.useState<'hours' | 'days' | 'weeks'>('days')
  function applyCustom(nRaw: string, unitId: 'hours' | 'days' | 'weeks') {
    const n = Math.max(1, Math.floor(Number(nRaw) || 0))
    const unit = CUSTOM_UNITS.find((u) => u.id === unitId)!
    onCooldown(Math.max(REUSABLE_COOLDOWN_FLOOR, n * unit.seconds))
  }
  return (
    <div className="flex flex-col gap-4">
      <FieldBlock
        heading="How often can a customer use it?"
        helper="A reusable offer can be redeemed again after a cooldown. The minimum is 30 minutes."
      >
        <div role="radiogroup" aria-label="Cooldown" className="inline-flex flex-wrap gap-2">
          {COOLDOWN_OPTIONS.map((o) => {
            const active = o.value === current
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onCooldown(o.value)}
                className={
                  active
                    ? 'inline-flex h-10 items-center rounded-[12px] border border-[#010C35] bg-[#010C35] px-4 text-[13px] font-semibold text-white'
                    : 'inline-flex h-10 items-center rounded-[12px] border border-[#D7DBE2] bg-white px-4 text-[13px] font-semibold text-[#1F2A4A] hover:bg-[#F8F9FA]'
                }
              >
                {o.label}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="custom-cooldown">
          <span className="text-[13px] font-semibold text-[#1F2A4A]">Or every</span>
          <input
            type="number"
            min={1}
            aria-label="Custom cooldown amount"
            value={customN}
            onChange={(e) => {
              setCustomN(e.target.value)
              applyCustom(e.target.value, customUnit)
            }}
            className="h-9 w-20 rounded-[10px] border border-[#D1D5DB] bg-white px-2 text-sm text-[#010C35]"
          />
          <select
            aria-label="Custom cooldown unit"
            value={customUnit}
            onChange={(e) => {
              const unit = e.target.value as 'hours' | 'days' | 'weeks'
              setCustomUnit(unit)
              applyCustom(customN, unit)
            }}
            className="h-9 rounded-[10px] border border-[#D1D5DB] bg-white px-2 text-sm text-[#010C35]"
          >
            {CUSTOM_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          {!presetActive ? (
            <span className="text-xs font-semibold text-[#0F7A3E]">Custom interval applied</span>
          ) : null}
        </div>
      </FieldBlock>
    </div>
  )
}
