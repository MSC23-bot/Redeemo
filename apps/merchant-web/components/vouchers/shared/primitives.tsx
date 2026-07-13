'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// Voucher Builder shared core: field primitives, prototype-faithful. Consolidates
// the two previously-forked bespoke primitive sets (builder/fields.tsx +
// onboarding/vouchers/fields.tsx) onto one brand-mapped set. Styled to the design
// tokens (cream identity, navy text, brand-rose focus).

export function FieldBlock({
  heading,
  helper,
  subHelper,
  children,
}: {
  heading: string
  helper?: string
  subHelper?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-[15px] font-bold text-[#010C35]">{heading}</p>
        {helper ? <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7390]">{helper}</p> : null}
        {subHelper ? <p className="mt-0.5 text-[12px] leading-relaxed text-[#8089A4]">{subHelper}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function SuggestionChips({
  chips,
  onPick,
  prefix,
  suffix,
  caption,
}: {
  chips: Array<string | number>
  onPick: (value: string) => void
  prefix?: string
  suffix?: string
  /** Optional "Tap a suggestion to start..." caption below the chips (prototype). */
  caption?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const label = typeof c === 'number' ? `${prefix ?? ''}${c}${suffix ?? ''}` : c
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
      {caption ? <p className="text-[12px] text-[#8089A4]">{caption}</p> : null}
    </div>
  )
}

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

export function TextAreaField({
  label,
  hideLabel,
  value,
  onChange,
  placeholder,
  id,
  rows = 3,
}: {
  label: string
  hideLabel?: boolean
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id?: string
  rows?: number
}) {
  const fieldId = id ?? `vf-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className={cn('text-sm font-medium text-[#010C35]', hideLabel && 'sr-only')}>
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[12px] border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm text-[#010C35] outline-none transition-[border-color,box-shadow] placeholder:text-[#8089A4] focus-visible:border-[#E20C04] focus-visible:ring-[3px] focus-visible:ring-[#E20C04]/20"
      />
    </div>
  )
}

export function MoneyField({
  label,
  value,
  onChange,
  unit = '£',
  unitTrailing,
  hideLabel,
  id,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  unit?: string
  unitTrailing?: boolean
  hideLabel?: boolean
  id?: string
}) {
  const fieldId = id ?? `vf-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className={cn('text-sm font-medium text-[#010C35]', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="flex h-10 items-center rounded-[12px] border border-[#D1D5DB] bg-white px-3 transition-[border-color,box-shadow] focus-within:border-[#E20C04] focus-within:ring-[3px] focus-within:ring-[#E20C04]/20">
        {!unitTrailing ? <span className="mr-1 text-sm text-[#6B7390]">{unit}</span> : null}
        <input
          id={fieldId}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          className="w-full bg-transparent text-sm text-[#010C35] outline-none placeholder:text-[#8089A4]"
        />
        {unitTrailing ? <span className="ml-1 text-sm text-[#6B7390]">{unit}</span> : null}
      </div>
    </div>
  )
}

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

// An amber / green info callout (prototype's cadence + guidance boxes).
export function InfoCallout({
  tone = 'amber',
  children,
}: {
  tone?: 'amber' | 'green'
  children: React.ReactNode
}) {
  const style =
    tone === 'green'
      ? { background: '#EAF8F3', border: '#BFE6D6', color: '#0F6357' }
      : { background: '#FEF6EC', border: '#F3D8AE', color: '#8A5A16' }
  return (
    <div
      className="rounded-[12px] border p-3 text-[13px] leading-relaxed"
      style={{ background: style.background, borderColor: style.border, color: style.color }}
    >
      {children}
    </div>
  )
}

export function toNum(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
