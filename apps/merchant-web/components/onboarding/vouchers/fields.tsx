'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// M2 F5: small shared building blocks for the guided builder fields. Styled to the
// design-system tokens (cream identity, navy text, brand-rose focus).

// A labelled field shell: bold heading + grey helper + the input slot + optional
// suggestion chips + an optional sub-helper underneath.
export function FieldBlock({
  heading,
  helper,
  children,
  subHelper,
}: {
  heading: string
  helper?: string
  children: React.ReactNode
  subHelper?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-[15px] font-bold text-[#010C35]">{heading}</p>
        {helper ? <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7390]">{helper}</p> : null}
      </div>
      {children}
      {subHelper ? <p className="text-xs text-[#8089A4]">{subHelper}</p> : null}
    </div>
  )
}

// The standard chip-helper line copy variants (S0 §3).
export const CHIP_HELPER_TYPE = 'Tap a suggestion to start, or type your own.'
export const CHIP_HELPER_WRITE = 'Tap a suggestion to start, or write your own.'

// A row of suggestion chips. Each chip, when tapped, calls onPick with its value.
export function SuggestionChips({
  chips,
  onPick,
  prefix,
  helper,
}: {
  chips: Array<string | number>
  onPick: (value: string) => void
  /** A money prefix shown on numeric chips (e.g. "£"). */
  prefix?: string
  helper?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const label = typeof c === 'number' ? `${prefix ?? ''}${c}` : c
          return (
            <button
              key={String(c)}
              type="button"
              onClick={() => onPick(String(c))}
              className="inline-flex h-[34px] items-center rounded-full border border-[#E0D7D0] bg-[#FFF9F5] px-3.5 text-[13px] font-medium text-[#1F2A4A] transition-colors hover:border-[#E20C04] hover:bg-[#FEF6F5]"
            >
              {label}
            </button>
          )
        })}
      </div>
      {helper ? <p className="text-xs text-[#8089A4]">{helper}</p> : null}
    </div>
  )
}

// A text input with an optional label (visually hidden when not wanted).
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hideLabel,
  id,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hideLabel?: boolean
  id?: string
}) {
  const fieldId = id ?? `vf-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className={cn('text-sm font-medium text-[#010C35]', hideLabel && 'sr-only')}>
        {label}
      </label>
      <input
        id={fieldId}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-[12px] border border-[#D1D5DB] bg-white px-3.5 text-sm text-[#010C35] outline-none transition-[border-color,box-shadow] placeholder:text-[#8089A4] focus-visible:border-[#E20C04] focus-visible:ring-[3px] focus-visible:ring-[#E20C04]/20"
      />
    </div>
  )
}

// A money / number input with a unit prefix (£ or %).
export function MoneyField({
  label,
  value,
  onChange,
  unit = '£',
  unitTrailing,
  id,
  readOnly,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  unit?: string
  /** When true, the unit sits after the number (for "%"). */
  unitTrailing?: boolean
  id?: string
  readOnly?: boolean
}) {
  const fieldId = id ?? `vf-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium text-[#010C35]">
        {label}
      </label>
      <div
        className={cn(
          'flex h-10 items-center rounded-[12px] border bg-white px-3 transition-[border-color,box-shadow] focus-within:border-[#E20C04] focus-within:ring-[3px] focus-within:ring-[#E20C04]/20',
          readOnly ? 'border-[#E5E7EB] bg-[#F8F9FA]' : 'border-[#D1D5DB]',
        )}
      >
        {!unitTrailing ? <span className="mr-1 text-sm text-[#6B7390]">{unit}</span> : null}
        <input
          id={fieldId}
          type="text"
          inputMode="decimal"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          className="w-full bg-transparent text-sm text-[#010C35] outline-none placeholder:text-[#8089A4]"
        />
        {unitTrailing ? <span className="ml-1 text-sm text-[#6B7390]">{unit}</span> : null}
      </div>
    </div>
  )
}

// A segmented control (radio group of pills).
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-10 items-center rounded-[12px] border px-4 text-[13px] font-semibold transition-colors',
              active
                ? 'border-[#010C35] bg-[#010C35] text-white'
                : 'border-[#D7DBE2] bg-white text-[#1F2A4A] hover:bg-[#F8F9FA]',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// Parse a numeric field value to a number (or undefined when blank/invalid).
export function toNum(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
