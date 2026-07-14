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
  packageItemPlaceholders,
} from '@/lib/voucher/config'
import type { DraftFields } from '@/lib/voucher/compose'
import { money } from '@/lib/voucher/builderCopy'
import { FieldBlock, SuggestionChips, TextField, MoneyField, Segmented, InfoCallout, toNum } from './primitives'
import { REUSABLE_COOLDOWN_FLOOR, type BuilderState } from '../builder/builderModel'
import type { BuilderType } from '@/lib/voucher/terms'
import type { AvailabilityWindow } from '@/lib/api/voucher'

// Voucher Builder shared core: the prototype-faithful per-type structured field
// groups, plus the TIME_LIMITED schedule editor and REUSABLE cooldown editor. All
// copy is verbatim from the prototype source (Redeemo-for-Business.FULL.html, the
// "You decide" region) and PROTOTYPE-INVENTORY sections 2.3-2.9 + A4-A6 / A13-A14.

interface FieldsProps {
  state: BuilderState
  categoryKey: CategoryKey
  /** The mechanic to render fields for (the picker id, or a wrapper's base mechanic). */
  mechanic: BuilderType
  onFields: (patch: Partial<DraftFields>) => void
}

const numStr = (n: number | undefined) => (typeof n === 'number' ? String(n) : '')

// The per-type structured field group (5 mechanics). Consumed directly for the 5
// structured types and inline beneath a wrapper's Step 1 once its base is picked.
export function MechanicFields(props: FieldsProps) {
  switch (props.mechanic) {
    case 'bogo':
      return <BogoFields {...props} />
    case 'spend':
      return <SpendFields {...props} />
    case 'discount':
      return <DiscountFields {...props} />
    case 'freebie':
      return <FreebieFields {...props} />
    case 'package':
      return <PackageFields {...props} />
    default:
      return null
  }
}

function BogoFields({ state, categoryKey, onFields }: FieldsProps) {
  const f = state.fields
  return (
    <div className="flex flex-col gap-5">
      <FieldBlock heading="What does the customer buy?" helper="The item they pay full price for. Describe it in your own words.">
        <SuggestionChips chips={buySuggestChips(categoryKey)} onPick={(v) => onFields({ bogoBuy: v })} caption="Tap a suggestion to start, or write your own." />
        <TextField label="Item" value={f.bogoBuy ?? ''} onChange={(v) => onFields({ bogoBuy: v })} placeholder="e.g. A main course" />
        <MoneyField label="Full price" value={numStr(f.bogoBuyFullPrice)} onChange={(v) => onFields({ bogoBuyFullPrice: toNum(v) })} />
        <p className="text-[12px] text-[#8089A4]">What this item normally costs without the voucher.</p>
      </FieldBlock>
      <FieldBlock heading="What do they get free?" helper="A second of the same or a similar item. This is what the customer gets as their discount.">
        <SuggestionChips chips={freeBogoChips()} onPick={(v) => onFields({ bogoFree: v })} />
        <TextField label="Item" value={f.bogoFree ?? ''} onChange={(v) => onFields({ bogoFree: v })} placeholder="e.g. A second of equal or lower value" />
        <MoneyField label="Value of the free item" value={numStr(f.bogoFreePrice)} onChange={(v) => onFields({ bogoFreePrice: toNum(v) })} />
        <p className="text-[12px] text-[#8089A4]">What the free item normally sells for. This is the saving the customer gets.</p>
      </FieldBlock>
    </div>
  )
}

function SpendFields({ state, categoryKey, onFields }: FieldsProps) {
  const f = state.fields
  return (
    <div className="flex flex-col gap-5">
      <FieldBlock
        heading="How much does a customer need to spend?"
        helper="The amount a customer spends in one visit to unlock the saving."
        subHelper="The total a customer spends in one visit before the saving applies."
      >
        <SuggestionChips chips={spendChips(categoryKey)} prefix="£" onPick={(v) => onFields({ spendAmount: toNum(v) })} caption="Tap a suggestion to start, or type your own." />
        <MoneyField label="Spend amount" hideLabel value={numStr(f.spendAmount)} onChange={(v) => onFields({ spendAmount: toNum(v) })} />
      </FieldBlock>
      <FieldBlock
        heading="How much do they save?"
        helper="What they get off when they reach that spend."
        subHelper="This is the saving the customer gets. It also shows as the estimated saving."
      >
        <SuggestionChips chips={saveChips(categoryKey)} prefix="£" onPick={(v) => onFields({ spendSave: toNum(v) })} />
        <MoneyField label="Save amount" hideLabel value={numStr(f.spendSave)} onChange={(v) => onFields({ spendSave: toNum(v) })} />
      </FieldBlock>
    </div>
  )
}

function DiscountFields({ state, onFields }: FieldsProps) {
  const f = state.fields
  const kind = f.discountKind ?? 'percent'
  const minOn = typeof f.discMin === 'number' && f.discMin > 0
  const [minToggle, setMinToggle] = React.useState(minOn)
  const showMin = kind === 'percent' && (minToggle || minOn)
  return (
    <div className="flex flex-col gap-5">
      <FieldBlock heading="What kind of discount?" helper="A straight discount off the price. Choose a fixed amount or a percentage.">
        <Segmented
          ariaLabel="Discount kind"
          value={kind}
          onChange={(v) => onFields({ discountKind: v })}
          options={[
            { value: 'percent', label: 'A percentage off' },
            { value: 'fixed', label: 'A fixed amount off' },
          ]}
        />
      </FieldBlock>
      {kind === 'fixed' ? (
        <>
          <FieldBlock heading="How much off?" helper="The amount taken off the price. This is the estimated saving.">
            <SuggestionChips chips={discountAmountChips()} prefix="£" onPick={(v) => onFields({ discAmount: toNum(v) })} />
            <MoneyField label="Amount off" hideLabel value={numStr(f.discAmount)} onChange={(v) => onFields({ discAmount: toNum(v) })} />
          </FieldBlock>
          <InfoCallout>
            A fixed amount off is a straight discount, like £10 off. If you want it to apply over a spend target, for example £10 off when you spend £40, that is the Spend and save type. Pick Spend and save from the voucher types instead.
          </InfoCallout>
        </>
      ) : (
        <>
          <FieldBlock heading="What percentage off?" helper="The share taken off the price.">
            <SuggestionChips chips={discountPercentChips()} suffix="%" onPick={(v) => onFields({ discPercent: toNum(v) })} />
            <MoneyField label="Percent off" hideLabel unit="%" unitTrailing value={numStr(f.discPercent)} onChange={(v) => onFields({ discPercent: toNum(v) })} />
          </FieldBlock>
          <FieldBlock
            heading="What is a typical order value?"
            helper="A normal order for your business, so we can estimate the saving."
            subHelper="We use this only to estimate the saving. It is not shown to customers."
          >
            <SuggestionChips chips={discountTypicalOrderChips()} prefix="£" onPick={(v) => onFields({ discTypicalOrder: toNum(v) })} />
            <MoneyField label="Typical order" hideLabel value={numStr(f.discTypicalOrder)} onChange={(v) => onFields({ discTypicalOrder: toNum(v) })} />
          </FieldBlock>
          {/* Minimum spend is a TOGGLE and percent-mode-only (A5). */}
          <FieldBlock
            heading="Is there a minimum spend?"
            helper="Optional. Apply the discount only when the customer spends at least this much. A percentage over a minimum, for example 20% off when you spend £25, is genuinely different from Spend and save."
          >
            <label className="flex w-fit items-center gap-2 text-sm text-[#010C35]">
              <input
                type="checkbox"
                checked={showMin}
                onChange={(e) => {
                  setMinToggle(e.target.checked)
                  if (!e.target.checked) onFields({ discMin: undefined })
                }}
                className="size-4 accent-[#E20C04]"
              />
              Set a minimum spend
            </label>
            {showMin ? (
              <div className="mt-2 flex flex-col gap-1.5">
                <SuggestionChips chips={discountMinSpendChips()} prefix="£" onPick={(v) => onFields({ discMin: toNum(v) })} />
                <MoneyField label="Minimum spend" hideLabel value={numStr(f.discMin)} onChange={(v) => onFields({ discMin: toNum(v) })} />
              </div>
            ) : null}
          </FieldBlock>
        </>
      )}
    </div>
  )
}

function FreebieFields({ state, categoryKey, onFields }: FieldsProps) {
  const f = state.fields
  const needsPurchase = f.freeNeedsPurchase ?? false
  return (
    <div className="flex flex-col gap-5">
      <FieldBlock
        heading="What does the customer get free?"
        helper="The item the customer receives at no cost. A different item from anything they buy. Describe it in your own words."
        subHelper="Keep it broad. This is what the customer gets for free."
      >
        <SuggestionChips chips={freebieItemChips(categoryKey)} onPick={(v) => onFields({ freeItem: v })} caption="Tap a suggestion to start, or write your own." />
        <TextField label="Free item" hideLabel value={f.freeItem ?? ''} onChange={(v) => onFields({ freeItem: v })} placeholder="e.g. A dessert" />
      </FieldBlock>
      <FieldBlock
        heading="What is it worth?"
        helper="What the free item normally costs. This is the saving the customer gets."
        subHelper="The free item's normal price. It also shows as the estimated saving."
      >
        <SuggestionChips chips={freebieWorthChips()} prefix="£" onPick={(v) => onFields({ freeWorth: toNum(v) })} />
        <MoneyField label="Worth" hideLabel value={numStr(f.freeWorth)} onChange={(v) => onFields({ freeWorth: toNum(v) })} />
      </FieldBlock>
      <FieldBlock heading="Do they need to buy something to get it?" helper="Choose whether the free item comes with a purchase or on its own.">
        <Segmented
          ariaLabel="Needs purchase"
          value={needsPurchase ? 'yes' : 'no'}
          onChange={(v) => onFields({ freeNeedsPurchase: v === 'yes' })}
          options={[
            { value: 'yes', label: 'Yes, with a purchase' },
            { value: 'no', label: 'No, it is free on its own.' },
          ]}
        />
      </FieldBlock>
      {needsPurchase ? (
        <FieldBlock heading="What do they need to buy?" helper="The qualifying purchase that unlocks the free item.">
          <SuggestionChips chips={freeQualifyChips(categoryKey)} onPick={(v) => onFields({ freeQualify: v })} />
          <TextField label="Qualifying purchase" hideLabel value={f.freeQualify ?? ''} onChange={(v) => onFields({ freeQualify: v })} placeholder="e.g. Any main" />
        </FieldBlock>
      ) : null}
    </div>
  )
}

// The and-list join used for the package "List the items" title (A6): items
// lowercased, joined with ", " and a final " and ". The composer capitalises the
// first character of the resulting phrase.
function andList(items: string[]): string {
  const arr = items.map((s) => s.trim()).filter(Boolean).map((s) => s.toLowerCase())
  if (arr.length <= 1) return arr[0] ?? ''
  return `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`
}

function PackageFields({ state, categoryKey, onFields }: FieldsProps) {
  const f = state.fields
  const mode = f.packageMode ?? 'describe'
  const list = f.packageList ?? ['', '', '']
  const placeholders = packageItemPlaceholders(categoryKey)
  const price = typeof f.packagePrice === 'number' ? f.packagePrice : 0
  const normal = typeof f.packageNormal === 'number' ? f.packageNormal : 0
  const pkgValid = price > 0 && normal > price
  const pkgWarn = price > 0 && normal > 0 && normal <= price

  function setList(next: string[]) {
    // Keep packageItems (the composed phrase) in sync so the composer stays unchanged.
    onFields({ packageList: next, packageItems: andList(next) })
  }

  return (
    <div className="flex flex-col gap-5">
      <FieldBlock heading="What is in the package?" helper="The items you bundle together and sell at one price. Describe the bundle in a line, or list the items one by one.">
        <Segmented
          ariaLabel="Package mode"
          value={mode}
          onChange={(v) => onFields({ packageMode: v })}
          options={[
            { value: 'describe', label: 'Describe it' },
            { value: 'list', label: 'List the items' },
          ]}
        />
        {mode === 'list' ? (
          <div className="mt-2 flex flex-col gap-2" data-testid="package-item-list">
            {list.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[#8089A4]">{i + 1}</span>
                <TextField
                  label={`Item ${i + 1}`}
                  hideLabel
                  value={item}
                  onChange={(v) => setList(list.map((x, idx) => (idx === i ? v : x)))}
                  placeholder={placeholders[i % placeholders.length]}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setList([...list, ''])}
              className="inline-flex h-9 w-fit items-center rounded-[10px] border border-[#D7DBE2] bg-white px-3.5 text-[13px] font-semibold text-[#1F2A4A] hover:bg-[#F8F9FA]"
            >
              Add another item
            </button>
            <p className="text-[12px] text-[#8089A4]">Customers see these items listed on the voucher.</p>
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            <SuggestionChips chips={packageItemChips(categoryKey)} onPick={(v) => onFields({ packageItems: v })} caption="Tap a suggestion to start, or write your own." />
            <TextField label="Package items" hideLabel value={f.packageItems ?? ''} onChange={(v) => onFields({ packageItems: v })} placeholder="e.g. Two mains and a bottle of wine" />
            <p className="text-[12px] text-[#8089A4]">Keep it broad. This is the bundle customers receive together.</p>
          </div>
        )}
      </FieldBlock>
      <FieldBlock heading="What does the customer pay?" helper="The one set price for the whole package.">
        <SuggestionChips chips={packagePriceChips()} prefix="£" onPick={(v) => onFields({ packagePrice: toNum(v) })} />
        <MoneyField label="Package price" hideLabel value={numStr(f.packagePrice)} onChange={(v) => onFields({ packagePrice: toNum(v) })} />
      </FieldBlock>
      <FieldBlock
        heading="What would these normally cost?"
        helper="The total if a customer bought the items separately. We use this to work out the saving."
        subHelper="This should be higher than the package price, so customers see a saving."
      >
        <SuggestionChips chips={packageNormalChips()} prefix="£" onPick={(v) => onFields({ packageNormal: toNum(v) })} />
        <MoneyField label="Normal total" hideLabel value={numStr(f.packageNormal)} onChange={(v) => onFields({ packageNormal: toNum(v) })} />
        {pkgValid ? (
          <p className="text-[12px] font-semibold text-[#0F7A3E]">
            Customers save £{money(Math.max(0, normal - price))} on the normal total of £{money(normal)}.
          </p>
        ) : null}
        {pkgWarn ? (
          <p className="text-[12px] font-semibold text-[#B45309]">
            The normal total should be higher than the package price, so customers see a real saving.
          </p>
        ) : null}
      </FieldBlock>
    </div>
  )
}

// --- TIME_LIMITED schedule editor ------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Quick-start presets (INVENTORY 2.8 / A13). One tap seeds a common window set; the
// rows stay fully editable afterwards. dayOfWeek uses OUR schema (Sun=0..Sat=6).
const WINDOW_PRESETS: Array<{ label: string; windows: AvailabilityWindow[] }> = [
  { label: 'Happy hour', windows: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, openTime: '17:00', closeTime: '19:00' })) },
  { label: 'Lunch', windows: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, openTime: '12:00', closeTime: '14:00' })) },
  { label: 'Weekend', windows: [6, 0].map((d) => ({ dayOfWeek: d, openTime: '12:00', closeTime: '17:00' })) },
]

export function ScheduleFields({
  state,
  onWindows,
  onExpiryDate,
  hasSavedEndDate = false,
}: {
  state: BuilderState
  onWindows: (windows: AvailabilityWindow[]) => void
  onExpiryDate: (date: string | null | undefined) => void
  hasSavedEndDate?: boolean
}) {
  const windows = state.availabilityWindows
  const hasEndDate = typeof state.expiryDate === 'string' && state.expiryDate.length > 0
  function addWindow() {
    onWindows([...windows, { dayOfWeek: 1, openTime: '17:00', closeTime: '19:00' }])
  }
  function patchWindow(idx: number, patch: Partial<AvailabilityWindow>) {
    onWindows(windows.map((w, i) => (i === idx ? { ...w, ...patch } : w)))
  }
  function removeWindow(idx: number) {
    onWindows(windows.filter((_, i) => i !== idx))
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#8089A4]">Step 2</p>
        <p className="mt-1 text-[15px] font-bold text-[#010C35]">When does it run?</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7390]">
          Set the days and times the voucher is available. This schedule is what makes it a time limited voucher.
        </p>
      </div>

      {windows.length === 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold text-[#1F2A4A]">Quick start</p>
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
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
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
              From
              <input
                aria-label={`Window ${idx + 1} open time`}
                type="time"
                value={w.openTime}
                onChange={(e) => patchWindow(idx, { openTime: e.target.value })}
                className="h-9 rounded-[10px] border border-[#D1D5DB] bg-white px-2 text-sm text-[#010C35]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[#010C35]">
              To
              <input
                aria-label={`Window ${idx + 1} close time`}
                type="time"
                value={w.closeTime}
                onChange={(e) => patchWindow(idx, { closeTime: e.target.value })}
                className="h-9 rounded-[10px] border border-[#D1D5DB] bg-white px-2 text-sm text-[#010C35]"
              />
            </label>
            {windows.length > 1 ? (
              <button
                type="button"
                onClick={() => removeWindow(idx)}
                className="ml-auto h-9 rounded-[10px] border border-[#E5E7EB] px-3 text-xs font-semibold text-[#6B7390] hover:bg-[#F8F9FA]"
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={addWindow}
          className="inline-flex h-10 w-fit items-center rounded-[12px] border border-[#D7DBE2] bg-white px-4 text-[13px] font-semibold text-[#1F2A4A] hover:bg-[#F8F9FA]"
        >
          + Add another window
        </button>
      </div>

      <InfoCallout>
        Unlike other vouchers, a time limited voucher can be redeemed once each time a window comes around, not just once a month. So a daily happy hour can be used once a day by the same customer. Plan the saving and times around that footfall and your margin.
      </InfoCallout>

      <FieldBlock heading="Does this voucher end on a date?" helper="Optional. Set a date for the whole voucher to stop, for example the end of a seasonal promotion. Leave off to keep it running.">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[#010C35]">
            <input
              type="checkbox"
              checked={hasEndDate}
              onChange={(e) => {
                // Untick (nullable-clear D1): explicit null when a SAVED end date exists
                // (the PATCH clears the stored column); undefined when there is none.
                onExpiryDate(e.target.checked ? new Date().toLocaleDateString('en-CA') : hasSavedEndDate ? null : undefined)
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

// --- REUSABLE cooldown editor ----------------------------------------------------

const COOLDOWN_PRESETS: Array<{ value: number; label: string }> = [
  { value: 3600, label: 'Every hour' },
  { value: 14400, label: 'Every 4 hours' },
  { value: 86400, label: 'Once a day' },
]

const CUSTOM_UNITS: Array<{ id: 'minutes' | 'hours' | 'days'; label: string; seconds: number }> = [
  { id: 'minutes', label: 'minutes', seconds: 60 },
  { id: 'hours', label: 'hours', seconds: 3600 },
  { id: 'days', label: 'days', seconds: 86400 },
]

export function CooldownFields({
  state,
  onCooldown,
}: {
  state: BuilderState
  onCooldown: (seconds: number) => void
}) {
  const current = state.cooldownSeconds ?? REUSABLE_COOLDOWN_FLOOR
  const presetActive = COOLDOWN_PRESETS.some((o) => o.value === current)
  const [customOpen, setCustomOpen] = React.useState(!presetActive)
  const seed = React.useMemo(() => {
    if (!presetActive && current > 0) {
      for (const u of [...CUSTOM_UNITS].reverse()) {
        if (current % u.seconds === 0) return { n: String(current / u.seconds), unit: u.id }
      }
      return { n: String(Math.max(1, Math.round(current / 3600))), unit: 'hours' as const }
    }
    return { n: '2', unit: 'hours' as const }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [customN, setCustomN] = React.useState(seed.n)
  const [customUnit, setCustomUnit] = React.useState<'minutes' | 'hours' | 'days'>(seed.unit)
  const [belowMin, setBelowMin] = React.useState(false)

  function applyCustom(nRaw: string, unitId: 'minutes' | 'hours' | 'days') {
    const n = Math.max(1, Math.floor(Number(nRaw) || 0))
    const unit = CUSTOM_UNITS.find((u) => u.id === unitId)!
    const seconds = n * unit.seconds
    setBelowMin(seconds < REUSABLE_COOLDOWN_FLOOR)
    onCooldown(Math.max(REUSABLE_COOLDOWN_FLOOR, seconds))
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#8089A4]">Step 2</p>
        <p className="mt-1 text-[15px] font-bold text-[#010C35]">How often can the same customer use this voucher?</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7390]">
          Set how soon a customer can redeem it again after each use. The minimum is 30 minutes.
        </p>
      </div>

      <div role="radiogroup" aria-label="Cooldown" className="inline-flex flex-wrap gap-2">
        {COOLDOWN_PRESETS.map((o) => {
          const active = o.value === current && !customOpen
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setCustomOpen(false)
                setBelowMin(false)
                onCooldown(o.value)
              }}
              className={
                active
                  ? 'inline-flex h-10 items-center rounded-[11px] border-[1.5px] border-[#198375] bg-[#EAF8F3] px-4 text-[13px] font-bold text-[#0F6357]'
                  : 'inline-flex h-10 items-center rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-[#6B7390] hover:bg-[#F8F9FA]'
              }
            >
              {o.label}
            </button>
          )
        })}
        <button
          type="button"
          role="radio"
          aria-checked={customOpen}
          onClick={() => setCustomOpen(true)}
          className={
            customOpen
              ? 'inline-flex h-10 items-center rounded-[11px] border-[1.5px] border-[#198375] bg-[#EAF8F3] px-4 text-[13px] font-bold text-[#0F6357]'
              : 'inline-flex h-10 items-center rounded-[11px] border-[1.5px] border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-[#6B7390] hover:bg-[#F8F9FA]'
          }
        >
          Custom
        </button>
      </div>

      {customOpen ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="custom-cooldown">
          <span className="text-[13px] font-semibold text-[#1F2A4A]">Every</span>
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
              const unit = e.target.value as 'minutes' | 'hours' | 'days'
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
        </div>
      ) : null}

      {belowMin ? (
        <p className="text-[12px] font-semibold text-[#B45309]">
          The shortest interval is 30 minutes. Please set 30 minutes or more.
        </p>
      ) : customOpen ? (
        <p className="text-[12px] font-semibold text-[#0F6357]">Custom interval applied</p>
      ) : null}

      <InfoCallout tone="green">
        Unlike most vouchers, a customer can use this more than once. After each redemption it becomes available again after the time you set, instead of once a month. Set the interval around your footfall and your margin.
      </InfoCallout>
    </div>
  )
}
