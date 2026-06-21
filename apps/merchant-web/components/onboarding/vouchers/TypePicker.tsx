'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { CategoryKey } from '@/lib/voucher/config'
import type { BuilderType } from '@/lib/voucher/terms'
import {
  PICKER_TYPES,
  exampleFor,
  isEligiblePickerType,
  PRIMER,
  type PickerTypeId,
} from '@/lib/voucher/typeMeta'

// M2 F5 Step 1: the flagship type picker. CC-3: 5 ELIGIBLE cards (BOGO recommended);
// Time-limited + Reusable render DISABLED-with-copy. A redemption-cycle primer frames
// the choice. Continue is enabled only when an eligible type is selected.

interface TypePickerProps {
  categoryKey: CategoryKey
  /** 1 or 2 - which flagship voucher the merchant is building. */
  voucherIndex: 1 | 2
  onContinue: (type: BuilderType) => void
  onBack: () => void
}

export function TypePicker({ categoryKey, voucherIndex, onContinue, onBack }: TypePickerProps) {
  const [selected, setSelected] = useState<BuilderType | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span
          className="inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: '#FEF0EE', color: '#E84A00' }}
        >
          Flagship voucher {voucherIndex} of 2
        </span>
        <h1 className="font-display text-2xl font-semibold text-[#010C35]">{PRIMER.pickerHeader}</h1>
        <p className="text-sm leading-relaxed text-[#6B7390]">{PRIMER.pickerSub}</p>
      </header>

      {/* Redemption-cycle primer */}
      <Card className="border-[#F1E0DA] bg-[#FFFBF8] p-5">
        <p className="text-sm font-bold text-[#010C35]">{PRIMER.primerHeading}</p>
        <p className="mt-0.5 text-xs text-[#6B7390]">{PRIMER.primerSub}</p>
        <div className="mt-3 rounded-[12px] bg-[#FEF6F5] p-3.5">
          <p className="text-xs font-bold uppercase tracking-wide text-[#E84A00]">{PRIMER.mostImportantRule}</p>
          <p className="mt-1 text-sm font-semibold text-[#010C35]">{PRIMER.cycleHeadline}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#455373]">{PRIMER.cycleBody}</p>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5">
          {PRIMER.howRedeemoWorks.map((line) => (
            <li key={line} className="flex gap-2 text-[13px] leading-relaxed text-[#455373]">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#E20C04]" />
              {line}
            </li>
          ))}
        </ul>
      </Card>

      {/* Type cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {PICKER_TYPES.map((t) => {
          const isSel = isEligiblePickerType(t.id) && selected === t.id
          const example = isEligiblePickerType(t.id) ? exampleFor(categoryKey, t.id) : null
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={isSel}
              disabled={!t.eligible}
              onClick={() => handlePick(t.id)}
              className={[
                'flex flex-col items-start gap-1.5 rounded-[14px] border-[1.5px] p-4 text-left transition-colors',
                !t.eligible
                  ? 'cursor-not-allowed border-[#E5E7EB] bg-[#F8F9FA] opacity-70'
                  : isSel
                    ? 'border-[#010C35] bg-[#FEF6F5]'
                    : 'border-[#E5E7EB] bg-white hover:border-[#E20C04]',
              ].join(' ')}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: t.accent }} />
                  <span className="text-sm font-bold text-[#010C35]">{t.label}</span>
                </span>
                {t.recommended ? (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ background: '#E9F7EF', color: '#0F7A3E' }}
                  >
                    Recommended
                  </span>
                ) : null}
              </span>
              <span className="text-[13px] leading-relaxed text-[#6B7390]">{t.blurb}</span>
              {example ? (
                <span className="mt-1 text-xs font-medium text-[#455373]">e.g. {example}</span>
              ) : null}
              {!t.eligible && t.disabledCopy ? (
                <span className="mt-1 text-xs leading-relaxed text-[#8089A4]">{t.disabledCopy}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-[#EFEAE6] pt-4">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="gradient"
          disabled={selected === null}
          onClick={() => selected && onContinue(selected)}
        >
          Continue
        </Button>
      </footer>
    </div>
  )

  function handlePick(id: PickerTypeId) {
    if (isEligiblePickerType(id)) setSelected(id)
  }
}
