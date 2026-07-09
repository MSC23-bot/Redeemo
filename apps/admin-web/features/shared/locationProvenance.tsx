/**
 * locationProvenance — shared mapping from a branch's `locationConfidence` to an
 * admin-facing provenance label, Badge tone, and icon.
 *
 * Branch Location Trust Slice 2 (spec 2026-07-09 §2.4). Labels are LOCKED to the
 * spec copy:
 *   ADDRESS_GEOCODED   -> "Google-verified (unreviewed)"  (info)
 *   MANUALLY_CONFIRMED -> "Human-confirmed"               (success)
 *   NEEDS_REVIEW       -> "Needs review"                  (warn, attention)
 *   POSTCODE_CENTROID  -> "Approximate (postcode)"        (warn)
 * Any unknown value falls back to the raw string with a neutral tone.
 *
 * Tones reuse the admin-panel's deliberately-neutral semantic Badge palette
 * (see .claude/rules/admin-web.md — no brand fonts/colours on this surface).
 * Icons are lucide-react SVGs (no emoji).
 */
import { ShieldCheck, MapPinned, AlertTriangle, MapPin } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import type { BadgeTone } from '@/features/shared/Badge'

export interface LocationProvenance {
  label: string
  tone: BadgeTone
  Icon: LucideIcon
}

const PROVENANCE: Record<string, LocationProvenance> = {
  ADDRESS_GEOCODED: { label: 'Google-verified (unreviewed)', tone: 'info', Icon: MapPinned },
  MANUALLY_CONFIRMED: { label: 'Human-confirmed', tone: 'success', Icon: ShieldCheck },
  NEEDS_REVIEW: { label: 'Needs review', tone: 'warn', Icon: AlertTriangle },
  POSTCODE_CENTROID: { label: 'Approximate (postcode)', tone: 'warn', Icon: MapPin },
}

/** Resolve the provenance descriptor for a confidence value (neutral fallback). */
export function locationProvenance(confidence: string): LocationProvenance {
  return PROVENANCE[confidence] ?? { label: confidence, tone: 'neutral', Icon: MapPin }
}

/** Spec label for a confidence value. */
export function locationProvenanceLabel(confidence: string): string {
  return locationProvenance(confidence).label
}

/** Badge tone for a confidence value. */
export function locationProvenanceTone(confidence: string): BadgeTone {
  return locationProvenance(confidence).tone
}

/**
 * A location is "trusted" (customer-visible pin + satisfies the go-live location
 * gate) for MANUALLY_CONFIRMED + ADDRESS_GEOCODED — mirrors the backend
 * CONFIRMED_LOCATION_SET. UI signal only; the backend gate is the authority.
 */
export function isLocationTrusted(confidence: string): boolean {
  return confidence === 'MANUALLY_CONFIRMED' || confidence === 'ADDRESS_GEOCODED'
}

/** A location still needing an admin correction before it can go live. */
export function isLocationUnconfirmed(confidence: string): boolean {
  return confidence === 'POSTCODE_CENTROID' || confidence === 'NEEDS_REVIEW'
}

interface LocationProvenanceBadgeProps {
  confidence: string
  className?: string
  /** Hide the leading icon (e.g. in a very dense row). Default: show it. */
  hideIcon?: boolean
}

/** Provenance pill: spec label + tone + a small leading SVG icon. */
export function LocationProvenanceBadge({
  confidence,
  className,
  hideIcon = false,
}: LocationProvenanceBadgeProps) {
  const { label, tone, Icon } = locationProvenance(confidence)
  return (
    <Badge tone={tone} className={className}>
      {!hideIcon && <Icon className="mr-1 size-3" aria-hidden="true" />}
      {label}
    </Badge>
  )
}
