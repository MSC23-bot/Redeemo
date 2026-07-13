'use client'

import * as React from 'react'
import { FileUpload } from '@/components/ui/file-upload'
import { TextField, TextAreaField, MoneyField } from './primitives'
import { money, savingHint, bogoSavingMismatchNote } from '@/lib/voucher/builderCopy'
import {
  effectiveTitle,
  effectiveDescription,
  effectiveSaving,
  baseMechanicOf,
  type BuilderState,
} from '../builder/builderModel'

// Voucher Builder shared core: the "What customers will see" card (photo, title,
// description, estimated saving). Copy verbatim from the prototype (FULL.html "What
// customers will see" region). The title / description carry a "Use our suggestion"
// reset affordance once edited; the estimated saving is editable for BOGO only (A14)
// and derived-and-read-only otherwise, with the savingHint + BOGO mismatch note + the
// below-£5 advisory warning (non-gating, CC-1).

export interface WhatCustomersSeeProps {
  state: BuilderState
  /** Whether editing an existing voucher (drives the photo revert/remove affordance). */
  isEdit: boolean
  onTitle: (v: string) => void
  onResetTitle: () => void
  onDescription: (v: string) => void
  onResetDescription: () => void
  onSaving: (v: number | undefined) => void
  onResetSaving: () => void
  onImageUrl: (url: string | null | undefined) => void
}

export function WhatCustomersSee({
  state,
  isEdit,
  onTitle,
  onResetTitle,
  onDescription,
  onResetDescription,
  onSaving,
  onResetSaving,
  onImageUrl,
}: WhatCustomersSeeProps) {
  const title = effectiveTitle(state)
  const description = effectiveDescription(state)
  const saving = effectiveSaving(state)
  const base = baseMechanicOf(state)
  const titleEdited = state.titleOverride != null && state.titleOverride.trim().length > 0
  const descEdited = state.descriptionOverride != null && state.descriptionOverride.trim().length > 0
  const savingEdited = typeof state.savingOverride === 'number' && state.savingOverride > 0

  const isBogo = base === 'bogo'
  const freeStandalone = base === 'freebie' && !state.fields.freeNeedsPurchase
  const belowMin = saving < 5 && !freeStandalone && saving >= 0 && base != null
  const mismatch = isBogo ? bogoSavingMismatchNote(state.fields.bogoFreePrice ?? 0, saving) : null

  return (
    <div className="rounded-[16px] border border-[#E5E7EB] bg-white p-5">
      <div className="mb-4">
        <h3 className="text-[15px] font-bold text-[#010C35]">What customers will see</h3>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7390]">
          You write everything on the voucher. We suggest a start; you have the final say.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Photo */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[#010C35]">Photo</label>
          <FileUpload
            kind="photo"
            label={state.imageUrl ? 'Replace photo' : 'Add a photo'}
            hint="JPG or PNG, landscape, at least 1200 by 600 pixels, up to 5 MB."
            onUploaded={(url) => onImageUrl(url)}
          />
          <p className="text-[12px] text-[#8089A4]">
            It fills the top of your voucher card. A photo of the item or your space works well.
          </p>
          {(() => {
            const savedBaseline = isEdit ? state.savedImageUrl : undefined
            if (!state.imageUrl) return null
            if (savedBaseline && state.imageUrl === savedBaseline) {
              return (
                <button type="button" onClick={() => onImageUrl(null)} className="w-fit text-xs font-semibold text-[#B91C1C] hover:underline">
                  Remove photo
                </button>
              )
            }
            // Session upload over a saved photo reverts to the saved baseline; on a
            // NEW voucher (no baseline) this clears via create-omission (undefined),
            // never an explicit null.
            return (
              <button type="button" onClick={() => onImageUrl(savedBaseline)} className="w-fit text-xs font-semibold text-[#B91C1C] hover:underline">
                {savedBaseline ? 'Use the saved photo instead' : 'Remove photo'}
              </button>
            )
          })()}
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[#010C35]">Title</label>
            {titleEdited ? (
              <button type="button" onClick={onResetTitle} className="text-xs font-semibold text-[#E20C04] hover:underline">
                Use our suggestion
              </button>
            ) : null}
          </div>
          <TextField label="Title" hideLabel value={title} onChange={onTitle} placeholder="Your voucher title" />
          <p className="text-[12px] text-[#8089A4]">
            {titleEdited
              ? 'Your wording. Customers see this exactly. 60 character limit.'
              : 'Suggested from what you entered. Edit it any way you like. 60 character limit.'}
          </p>
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[#010C35]">Description</label>
            {descEdited ? (
              <button type="button" onClick={onResetDescription} className="text-xs font-semibold text-[#E20C04] hover:underline">
                Use our suggestion
              </button>
            ) : null}
          </div>
          <TextAreaField label="Description" hideLabel value={description} onChange={onDescription} placeholder="Tell customers why they will love this offer." />
          <p className="text-[12px] text-[#8089A4]">
            {descEdited
              ? 'Your wording. 300 character limit.'
              : 'Suggested. Make it your own to sell the offer in your voice. 300 character limit.'}
          </p>
        </div>

        {/* Estimated saving */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[#010C35]">Estimated saving</label>
            {isBogo && savingEdited ? (
              <button type="button" onClick={onResetSaving} className="text-xs font-semibold text-[#E20C04] hover:underline">
                Reset to suggested
              </button>
            ) : null}
          </div>
          {isBogo ? (
            <MoneyField label="Estimated saving" hideLabel value={saving > 0 ? money(saving) : ''} onChange={(v) => onSaving(v === '' ? undefined : Number(v))} />
          ) : (
            <div className="flex h-10 items-center rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FA] px-3 text-sm font-semibold text-[#4B5366]">
              {saving > 0 ? `£${money(saving)}` : 'Add the details above'}
            </div>
          )}
          <p className="text-[12px] text-[#8089A4]">{savingHint(state.fields)}</p>
          {mismatch ? <p className="text-[12px] font-semibold text-[#B45309]">{mismatch}</p> : null}
        </div>

        {/* Below-minimum advisory (CC-1: advisory, never gates submit). */}
        {belowMin ? (
          <div className="rounded-[12px] border border-[#F3D8AE] bg-[#FEF6EC] p-3">
            <p className="text-[13px] font-bold text-[#8A5A16]">Below Redeemo&apos;s minimum saving</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[#8A5A16]">
              Offers need to save a customer at least £5 to be worth their trip. Raise the saving, or make the free item more generous.
            </p>
            <button
              type="button"
              onClick={() => onSaving(5)}
              className="mt-2 inline-flex h-8 items-center rounded-[10px] border border-[#E5B87A] bg-white px-3 text-xs font-semibold text-[#8A5A16] hover:bg-[#FDF0DD]"
            >
              Set saving to £5
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
