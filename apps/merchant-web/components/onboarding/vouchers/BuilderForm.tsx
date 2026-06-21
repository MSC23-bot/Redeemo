'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { FileUpload } from '@/components/ui/file-upload'
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
import {
  buildClauseList,
  defaultSelectedClauseIds,
  tierBadge,
  tierOf,
  countTermTiers,
  CUSTOM_CHAR_LIMIT,
  type BuilderType,
  type Clause,
  type CustomTerm,
} from '@/lib/voucher/terms'
import {
  composeTitle,
  composeDescription,
  deriveSaving,
  deriveSavingPercent,
  TITLE_CHAR_LIMIT,
  DESC_CHAR_LIMIT,
  type DraftFields,
} from '@/lib/voucher/compose'
import { scoreVoucher } from '@/lib/voucher/scoring'
import { ScoreCard } from './ScoreCard'
import {
  FieldBlock,
  SuggestionChips,
  TextField,
  MoneyField,
  Segmented,
  CHIP_HELPER_TYPE,
  CHIP_HELPER_WRITE,
  toNum,
} from './fields'

// M2 F5 Step 2: the guided voucher builder. Form left, live preview + advisory score
// right. Per-type structured fields (S0 §3) + category suggestion chips (S0 §1) + the
// terms section (S0 §2, Fair/Caution/Restrictive) + the live "How this voucher stacks
// up" advisory score (S0 §4). CC-1: Save + Submit are NEVER blocked by the score.

export interface BuilderSavePayload {
  title: string
  description: string
  estimatedSaving: number
  terms: string
  imageUrl?: string
  merchantFields: Record<string, unknown>
}

interface BuilderFormProps {
  type: BuilderType
  categoryKey: CategoryKey
  merchantBusinessName: string
  voucherIndex: 1 | 2
  saving: boolean
  saveError: string | null
  onSave: (payload: BuilderSavePayload) => void
  onSubmit: (payload: BuilderSavePayload) => void
  onBack: () => void
}

export function BuilderForm({
  type,
  categoryKey,
  merchantBusinessName,
  voucherIndex,
  saving,
  saveError,
  onSave,
  onSubmit,
  onBack,
}: BuilderFormProps) {
  // Per-type structured fields bag (the DraftFields model).
  const [draft, setDraft] = useState<DraftFields>(() => ({
    type,
    merchantBusinessName,
    discountKind: type === 'discount' ? 'percent' : undefined,
    freeNeedsPurchase: type === 'freebie' ? true : undefined,
  }))

  // Terms: selected built-in clause ids + custom terms + the custom draft.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(defaultSelectedClauseIds(type)))
  const [customs, setCustoms] = useState<CustomTerm[]>([])
  const [customDraft, setCustomDraft] = useState('')

  // "What customers will see" overrides + the edited flags.
  const [titleOverride, setTitleOverride] = useState('')
  const [titleEdited, setTitleEdited] = useState(false)
  const [descOverride, setDescOverride] = useState('')
  const [descEdited, setDescEdited] = useState(false)
  const [savingOverride, setSavingOverride] = useState('')
  const [savingEdited, setSavingEdited] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [askHelp, setAskHelp] = useState(false)

  // Saving is READ-ONLY (computed) for Spend / Freebie / Package (S0 §3.6).
  const savingReadOnly = type === 'spend' || type === 'freebie' || type === 'package'

  // Derived values.
  const suggestedTitle = useMemo(() => composeTitle(draft), [draft])
  const suggestedDesc = useMemo(() => composeDescription(draft), [draft])
  const derivedSaving = useMemo(() => deriveSaving(draft), [draft])
  const savingPercent = useMemo(() => deriveSavingPercent(draft), [draft])

  const previewTitle = titleEdited ? titleOverride : suggestedTitle
  const previewDesc = descEdited ? descOverride : suggestedDesc
  const effectiveSaving = savingEdited && !savingReadOnly ? toNum(savingOverride) ?? 0 : derivedSaving

  // Terms list for this type (live spend amount feeds spend_single; discount kind +
  // min feed disc_min_spend; freebie needs-purchase feeds with_qualifying).
  const clauses = useMemo<Clause[]>(
    () =>
      buildClauseList({
        type,
        categoryKey,
        spendAmt: draft.spendAmount,
        freeNeedsPurchase: draft.freeNeedsPurchase,
        discountKind: draft.discountKind,
        discMin: draft.discMin,
      }),
    [type, categoryKey, draft.spendAmount, draft.freeNeedsPurchase, draft.discountKind, draft.discMin],
  )

  const selectedClauses = clauses.filter((c) => selectedIds.has(c.id))
  const counts = countTermTiers(selectedClauses, customs)

  const score = useMemo(
    () =>
      scoreVoucher({
        type,
        savingValue: effectiveSaving,
        savingPercent,
        previewTitle,
        previewDesc,
        descUntouched: !descEdited,
        hasPhoto: !!photoUrl,
        freeStandalone: type === 'freebie' && draft.freeNeedsPurchase === false,
        reuseFrequent: false,
        selectedClauses,
        customs,
      }),
    [type, effectiveSaving, savingPercent, previewTitle, previewDesc, descEdited, photoUrl, draft.freeNeedsPurchase, selectedClauses, customs],
  )

  function patch(p: Partial<DraftFields>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function toggleClause(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addCustom() {
    const text = customDraft.trim()
    if (!text) return
    setCustoms((c) => [...c, { text, tier: tierOf(text) }])
    setCustomDraft('')
  }

  function removeCustom(idx: number) {
    setCustoms((c) => c.filter((_, i) => i !== idx))
  }

  // Build the terms string sent to the backend: the selected built-in labels + custom
  // texts, one per line.
  function buildTermsText(): string {
    const builtin = selectedClauses.map((c) => c.label)
    const custom = customs.map((c) => c.text)
    return [...builtin, ...custom].join('\n')
  }

  function buildPayload(): BuilderSavePayload {
    // The whole DraftFields bag + the picker context lands in merchantFields so the
    // guided builder can rehydrate an edit (the backend merges this into the RMV's
    // merchantFields JSON column).
    const merchantFields: Record<string, unknown> = {
      builderType: type,
      categoryKey,
      ...draft,
      selectedClauseIds: Array.from(selectedIds),
      customTerms: customs,
      askHelp,
      titleEdited,
      descEdited,
    }
    return {
      title: previewTitle,
      description: previewDesc,
      estimatedSaving: effectiveSaving,
      terms: buildTermsText(),
      imageUrl: photoUrl ?? undefined,
      merchantFields,
    }
  }

  const submitLabel = `Save voucher ${voucherIndex} of 2`

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* LEFT: the form */}
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex flex-col gap-1">
          <span
            className="inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: '#FEF0EE', color: '#E84A00' }}
          >
            Flagship voucher {voucherIndex} of 2
          </span>
          <h1 className="font-display text-2xl font-semibold text-[#010C35]">Build your voucher</h1>
        </header>

        {/* Per-type structured fields */}
        <Card className="border-[#E5E7EB] p-5">
          {renderTypeFields()}
        </Card>

        {/* What customers will see */}
        <Card className="border-[#E5E7EB] p-5">
          <div className="mb-3">
            <h2 className="text-[15px] font-bold text-[#010C35]">What customers will see</h2>
            <p className="mt-0.5 text-[13px] text-[#6B7390]">
              You write everything on the voucher. We suggest a start; you have the final say.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <FileUpload
              kind="banner"
              label={photoUrl ? 'Replace photo' : 'Add a photo'}
              hint="JPG or PNG, landscape, at least 1200 by 600 pixels, up to 5 MB."
              onUploaded={(url) => setPhotoUrl(url)}
            />

            {/* Title */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor="vf-title" className="text-sm font-medium text-[#010C35]">Title</label>
                {titleEdited ? (
                  <button type="button" onClick={resetTitle} className="text-xs font-semibold text-[#E20C04] hover:underline">
                    Use our suggestion
                  </button>
                ) : null}
              </div>
              <input
                id="vf-title"
                type="text"
                maxLength={TITLE_CHAR_LIMIT}
                value={previewTitle}
                onChange={(e) => {
                  setTitleEdited(true)
                  setTitleOverride(e.target.value)
                }}
                className="h-10 w-full rounded-[12px] border border-[#D1D5DB] bg-white px-3.5 text-sm text-[#010C35] outline-none focus-visible:border-[#E20C04] focus-visible:ring-[3px] focus-visible:ring-[#E20C04]/20"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#010C35]">Description</span>
                {descEdited ? (
                  <button type="button" onClick={resetDesc} className="text-xs font-semibold text-[#E20C04] hover:underline">
                    Use our suggestion
                  </button>
                ) : null}
              </div>
              <Textarea
                label="Description"
                id="vf-desc"
                maxLength={DESC_CHAR_LIMIT}
                value={previewDesc}
                className="[&_label]:sr-only"
                onChange={(e) => {
                  setDescEdited(true)
                  setDescOverride(e.target.value)
                }}
              />
            </div>

            {/* Estimated saving */}
            <div className="flex flex-col gap-1.5">
              <MoneyField
                label="Estimated saving"
                value={savingReadOnly ? String(derivedSaving) : savingEdited ? savingOverride : String(derivedSaving)}
                readOnly={savingReadOnly}
                onChange={(v) => {
                  setSavingEdited(true)
                  setSavingOverride(v)
                }}
              />
              {effectiveSaving < 5 && !(type === 'freebie' && draft.freeNeedsPurchase === false) ? (
                <div className="rounded-[12px] border border-[#F4D9A8] bg-[#FEF6EC] p-3">
                  <p className="text-sm font-bold text-[#B45309]">Below Redeemo&apos;s minimum saving</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-[#7A5200]">
                    Offers need to save a customer at least £5 to be worth their trip. Raise the saving, or make the free item more generous.
                  </p>
                  {!savingReadOnly ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSavingEdited(true)
                        setSavingOverride('5')
                      }}
                      className="mt-2 inline-flex h-8 items-center rounded-[10px] border border-[#E8A93A] bg-white px-3 text-xs font-bold text-[#B45309]"
                    >
                      Set saving to £5
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        {/* Terms */}
        <Card data-testid="terms-section" className="border-[#E5E7EB] p-5">
          <div className="mb-3">
            <h2 className="text-[15px] font-bold text-[#010C35]">Your terms</h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7390]">
              Pick from this set so customers always know what to expect. The fewer you pick, the more people will redeem. Caution terms may put some customers off; Restrictive terms can stop people redeeming altogether.
            </p>
          </div>

          <ul className="flex flex-col gap-1.5">
            {clauses.map((c) => {
              const checked = selectedIds.has(c.id)
              const badge = tierBadge[c.tier]
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] p-2 hover:bg-[#FBFAF9]">
                    {/* No aria-label here: the wrapping <label> supplies the accessible
                        name, so it includes BOTH the clause text AND the tier badge span
                        (Caution / Restrictive). An aria-label would override the label and
                        drop the tier severity from the SR-announced name. */}
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleClause(c.id)}
                      className="mt-0.5 size-4 accent-[#E20C04]"
                    />
                    <span className="flex flex-1 flex-wrap items-center gap-2">
                      <span className="text-[13px] leading-relaxed text-[#1F2A4A]">{c.label}</span>
                      {badge ? (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                          style={badgeStyle(c.tier)}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          {/* Custom terms */}
          {customs.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {customs.map((c, i) => (
                <li key={`${c.text}-${i}`} className="flex items-start gap-2 rounded-[10px] bg-[#FBFAF9] p-2">
                  <span className="flex flex-1 flex-wrap items-center gap-2">
                    <span className="text-[13px] leading-relaxed text-[#1F2A4A]">{c.text}</span>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ background: '#EFEAFE', color: '#5B21B6' }}
                    >
                      Custom
                    </span>
                    {c.tier === 'restrictive' ? (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={badgeStyle('restrictive')}
                      >
                        Restrictive
                      </span>
                    ) : null}
                  </span>
                  <button type="button" onClick={() => removeCustom(i)} className="text-xs font-semibold text-[#B91C1C] hover:underline">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Add your own */}
          <div className="mt-3 flex flex-col gap-1.5">
            <TextField
              label="Add your own term"
              value={customDraft}
              onChange={setCustomDraft}
              placeholder="Add your own term"
            />
            <p className="text-xs text-[#8089A4]">
              Keep it simple and fair. {Math.max(0, CUSTOM_CHAR_LIMIT - customDraft.length)} characters left of {CUSTOM_CHAR_LIMIT}.
            </p>
            {customDraft.trim() && tierOf(customDraft) === 'restrictive' ? (
              <p className="text-xs font-medium text-[#B91C1C]">This reads as restrictive. Try to simplify before adding.</p>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={addCustom}
              disabled={customDraft.trim().length === 0 || customDraft.length > CUSTOM_CHAR_LIMIT}
            >
              Add term
            </Button>
          </div>

          {/* Stacking note */}
          {counts.tooRestrictive ? (
            <p className="mt-3 rounded-[10px] bg-[#FEECEC] p-3 text-[13px] leading-relaxed text-[#B91C1C]">
              Your voucher is too restrictive. Drop a term or two, especially the strictest, so customers can actually redeem.
            </p>
          ) : counts.becomingRestrictive ? (
            <p className="mt-3 rounded-[10px] bg-[#FEF6EC] p-3 text-[13px] leading-relaxed text-[#B45309]">
              Your voucher is becoming restrictive. Easing off can help more customers redeem it, and a clean, simple voucher always scores better.
            </p>
          ) : null}
        </Card>

        {/* Concierge toggle */}
        <Card className="border-[#E5E7EB] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[#010C35]">Ask the Redeemo team to help with this offer</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7390]">
                Turn this on if you would like our team to help build or improve this voucher with you. You always approve it before it goes live.
              </p>
            </div>
            <Switch checked={askHelp} onCheckedChange={setAskHelp} label="Ask the Redeemo team to help with this offer" />
          </div>
          {askHelp ? (
            <span className="mt-3 inline-flex items-center rounded-full bg-[#FEF6F5] px-3 py-1 text-xs font-semibold text-[#E84A00]">
              Flagged for the Redeemo team
            </span>
          ) : null}
        </Card>

        {saveError ? (
          <p role="alert" className="rounded-[12px] bg-[#FEECEC] p-3 text-sm font-medium text-[#B91C1C]">
            {saveError}
          </p>
        ) : null}

        {/* Sticky dual CTA footer. CC-1: NEITHER button is disabled by the score. */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EFEAE6] pt-4">
          <Button variant="secondary" onClick={onBack} disabled={saving}>
            Back
          </Button>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => onSave(buildPayload())} disabled={saving}>
              Save as draft
            </Button>
            <Button variant="gradient" onClick={() => onSubmit(buildPayload())} disabled={saving}>
              {saving ? 'Saving...' : submitLabel}
            </Button>
          </div>
        </footer>
      </div>

      {/* RIGHT: live preview + advisory score */}
      <aside className="flex w-full flex-col gap-4 lg:max-w-sm">
        <VoucherPreview title={previewTitle} description={previewDesc} saving={effectiveSaving} photoUrl={photoUrl} accent={typeAccent(type)} />
        <ScoreCard score={score} />
      </aside>
    </div>
  )

  // ── reset helpers ──────────────────────────────────────────────────────────
  function resetTitle() {
    setTitleEdited(false)
    setTitleOverride('')
  }
  function resetDesc() {
    setDescEdited(false)
    setDescOverride('')
  }

  // ── per-type field renderers (S0 §3) ───────────────────────────────────────
  function renderTypeFields() {
    if (type === 'bogo') return renderBogo()
    if (type === 'spend') return renderSpend()
    if (type === 'discount') return renderDiscount()
    if (type === 'freebie') return renderFreebie()
    return renderPackage()
  }

  function renderBogo() {
    return (
      <div className="flex flex-col gap-6">
        <FieldBlock heading="What does the customer buy?" helper="The item they pay full price for. Describe it in your own words.">
          <TextField label="Item" value={draft.bogoBuy ?? ''} onChange={(v) => patch({ bogoBuy: v })} placeholder="e.g. a main" />
          <SuggestionChips chips={buySuggestChips(categoryKey)} onPick={(v) => patch({ bogoBuy: v })} helper={CHIP_HELPER_WRITE} />
          <MoneyField label="Full price" value={numStr(draft.bogoBuyFullPrice)} onChange={(v) => patch({ bogoBuyFullPrice: toNum(v) })} />
          <p className="text-xs text-[#8089A4]">What this item normally costs without the voucher.</p>
        </FieldBlock>
        <FieldBlock heading="What do they get free?" helper="A second of the same or a similar item. This is what the customer gets as their discount.">
          <TextField label="Item" value={draft.bogoFree ?? ''} onChange={(v) => patch({ bogoFree: v })} placeholder="e.g. a second item" />
          <SuggestionChips chips={freeBogoChips()} onPick={(v) => patch({ bogoFree: v })} />
          <MoneyField label="Value of the free item" value={numStr(draft.bogoFreePrice)} onChange={(v) => patch({ bogoFreePrice: toNum(v) })} />
          <p className="text-xs text-[#8089A4]">What the free item normally sells for. This is the saving the customer gets.</p>
        </FieldBlock>
      </div>
    )
  }

  function renderSpend() {
    return (
      <div className="flex flex-col gap-6">
        <FieldBlock heading="How much does a customer need to spend?" helper="The amount a customer spends in one visit to unlock the saving." subHelper="The total a customer spends in one visit before the saving applies.">
          <MoneyField label="Spend amount" value={numStr(draft.spendAmount)} onChange={(v) => patch({ spendAmount: toNum(v) })} />
          <SuggestionChips chips={spendChips(categoryKey)} prefix="£" onPick={(v) => patch({ spendAmount: toNum(v) })} helper={CHIP_HELPER_TYPE} />
        </FieldBlock>
        <FieldBlock heading="How much do they save?" helper="What they get off when they reach that spend." subHelper="This is the saving the customer gets. It also shows as the estimated saving.">
          <MoneyField label="Save amount" value={numStr(draft.spendSave)} onChange={(v) => patch({ spendSave: toNum(v) })} />
          <SuggestionChips chips={saveChips(categoryKey)} prefix="£" onPick={(v) => patch({ spendSave: toNum(v) })} />
        </FieldBlock>
      </div>
    )
  }

  function renderDiscount() {
    const kind = draft.discountKind ?? 'percent'
    return (
      <div className="flex flex-col gap-6">
        <FieldBlock heading="What kind of discount?" helper="A straight discount off the price. Choose a fixed amount or a percentage.">
          <Segmented
            ariaLabel="Discount kind"
            value={kind}
            onChange={(v) => patch({ discountKind: v })}
            options={[
              { value: 'percent', label: 'A percentage off' },
              { value: 'fixed', label: 'A fixed amount off' },
            ]}
          />
        </FieldBlock>

        {kind === 'fixed' ? (
          <FieldBlock heading="How much off?" helper="The amount taken off the price. This is the estimated saving.">
            <MoneyField label="Amount off" value={numStr(draft.discAmount)} onChange={(v) => patch({ discAmount: toNum(v) })} />
            <SuggestionChips chips={discountAmountChips()} prefix="£" onPick={(v) => patch({ discAmount: toNum(v) })} />
          </FieldBlock>
        ) : (
          <>
            <FieldBlock heading="What percentage off?" helper="The share taken off the price.">
              <MoneyField label="What percentage off" value={numStr(draft.discPercent)} onChange={(v) => patch({ discPercent: toNum(v) })} unit="%" unitTrailing />
              <SuggestionChips chips={discountPercentChips()} onPick={(v) => patch({ discPercent: toNum(v) })} />
            </FieldBlock>
            {!draft.discMin ? (
              <FieldBlock heading="What is a typical order value?" helper="A normal order for your business, so we can estimate the saving." subHelper="We use this only to estimate the saving. It is not shown to customers.">
                <MoneyField label="Typical order value" value={numStr(draft.discTypicalOrder)} onChange={(v) => patch({ discTypicalOrder: toNum(v) })} />
                <SuggestionChips chips={discountTypicalOrderChips()} prefix="£" onPick={(v) => patch({ discTypicalOrder: toNum(v) })} />
              </FieldBlock>
            ) : null}
          </>
        )}

        <FieldBlock heading="Is there a minimum spend?" helper="Optional. Apply the discount only when the customer spends at least this much. A percentage over a minimum, for example 20% off when you spend £25, is genuinely different from Spend and save.">
          <MoneyField label="Minimum spend" value={numStr(draft.discMin)} onChange={(v) => patch({ discMin: toNum(v) })} />
          <SuggestionChips chips={discountMinSpendChips()} prefix="£" onPick={(v) => patch({ discMin: toNum(v) })} />
        </FieldBlock>
      </div>
    )
  }

  function renderFreebie() {
    const needs = draft.freeNeedsPurchase !== false
    return (
      <div className="flex flex-col gap-6">
        <FieldBlock heading="What does the customer get free?" helper="The item the customer receives at no cost. A different item from anything they buy. Describe it in your own words." subHelper="Keep it broad. This is what the customer gets for free.">
          <TextField label="Free item" value={draft.freeItem ?? ''} onChange={(v) => patch({ freeItem: v })} placeholder="e.g. a side" />
          <SuggestionChips chips={freebieItemChips(categoryKey)} onPick={(v) => patch({ freeItem: v })} helper={CHIP_HELPER_WRITE} />
        </FieldBlock>
        <FieldBlock heading="What is it worth?" helper="What the free item normally costs. This is the saving the customer gets." subHelper="The free item's normal price. It also shows as the estimated saving.">
          <MoneyField label="Worth" value={numStr(draft.freeWorth)} onChange={(v) => patch({ freeWorth: toNum(v) })} />
          <SuggestionChips chips={freebieWorthChips()} prefix="£" onPick={(v) => patch({ freeWorth: toNum(v) })} />
        </FieldBlock>
        <FieldBlock heading="Do they need to buy something to get it?" helper="Choose whether the free item comes with a purchase or on its own.">
          <Segmented
            ariaLabel="Free needs purchase"
            value={needs ? 'yes' : 'no'}
            onChange={(v) => patch({ freeNeedsPurchase: v === 'yes' })}
            options={[
              { value: 'yes', label: 'Yes, with a purchase' },
              { value: 'no', label: 'No, it is free on its own.' },
            ]}
          />
        </FieldBlock>
        {needs ? (
          <FieldBlock heading="What do they need to buy?" helper="The qualifying purchase that unlocks the free item.">
            <TextField label="Qualifying purchase" value={draft.freeQualify ?? ''} onChange={(v) => patch({ freeQualify: v })} placeholder="e.g. any main" />
            <SuggestionChips chips={freeQualifyChips(categoryKey)} onPick={(v) => patch({ freeQualify: v })} />
          </FieldBlock>
        ) : null}
      </div>
    )
  }

  function renderPackage() {
    const showWarn = typeof draft.packageNormal === 'number' && typeof draft.packagePrice === 'number' && draft.packageNormal <= draft.packagePrice
    return (
      <div className="flex flex-col gap-6">
        <FieldBlock heading="What is in the package?" helper="The items you bundle together and sell at one price. Describe the bundle in a line, or list the items one by one." subHelper="Keep it broad. This is the bundle customers receive together.">
          <TextField label="Package items" value={draft.packageItems ?? ''} onChange={(v) => patch({ packageItems: v })} placeholder="e.g. a starter, main and dessert" />
          <SuggestionChips chips={packageItemChips(categoryKey)} onPick={(v) => patch({ packageItems: v })} helper={CHIP_HELPER_WRITE} />
        </FieldBlock>
        <FieldBlock heading="What does the customer pay?" helper="The one set price for the whole package.">
          <MoneyField label="Package price" value={numStr(draft.packagePrice)} onChange={(v) => patch({ packagePrice: toNum(v) })} />
          <SuggestionChips chips={packagePriceChips()} prefix="£" onPick={(v) => patch({ packagePrice: toNum(v) })} />
        </FieldBlock>
        <FieldBlock heading="What would these normally cost?" helper="The total if a customer bought the items separately. We use this to work out the saving." subHelper="This should be higher than the package price, so customers see a saving.">
          <MoneyField label="Normal total" value={numStr(draft.packageNormal)} onChange={(v) => patch({ packageNormal: toNum(v) })} />
          <SuggestionChips chips={packageNormalChips()} prefix="£" onPick={(v) => patch({ packageNormal: toNum(v) })} />
          {showWarn ? (
            <p className="text-xs font-medium text-[#B45309]">
              The normal total should be higher than the package price, so customers see a real saving.
            </p>
          ) : null}
        </FieldBlock>
      </div>
    )
  }
}

function numStr(v: number | undefined): string {
  return typeof v === 'number' ? String(v) : ''
}

function badgeStyle(tier: 'fair' | 'caution' | 'restrictive') {
  if (tier === 'restrictive') return { background: '#FEECEC', color: '#B91C1C' }
  return { background: '#FEF6EC', color: '#B45309' }
}

const TYPE_ACCENT: Record<BuilderType, string> = {
  bogo: '#7C3AED',
  spend: '#E84A00',
  discount: '#E20C04',
  freebie: '#16A34A',
  package: '#2563EB',
}
function typeAccent(type: BuilderType): string {
  return TYPE_ACCENT[type]
}

// A small live preview of the voucher card.
function VoucherPreview({
  title,
  description,
  saving,
  photoUrl,
  accent,
}: {
  title: string
  description: string
  saving: number
  photoUrl: string | null
  accent: string
}) {
  return (
    <Card className="overflow-hidden border-[#E5E7EB] p-0">
      <div className="h-28 w-full" style={{ background: photoUrl ? `center/cover url(${photoUrl})` : `linear-gradient(135deg, ${accent}, ${accent}CC)` }} />
      <div className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${accent}1A`, color: accent }}>
            <span className="size-1.5 rounded-full" style={{ background: accent }} />
            Flagship
          </span>
          {saving > 0 ? (
            <span className="font-display text-lg font-semibold text-[#16A34A]">Save £{formatSaving(saving)}</span>
          ) : null}
        </div>
        <p data-testid="preview-title" className="text-sm font-bold text-[#010C35]">{title || 'Your voucher title'}</p>
        <p data-testid="preview-desc" className="text-xs leading-relaxed text-[#6B7390]">{description}</p>
      </div>
    </Card>
  )
}

function formatSaving(n: number): string {
  const r = Math.round(n * 100) / 100
  return r % 1 === 0 ? String(r) : r.toFixed(2)
}
