'use client'

/**
 * PR-B Task B9: the shared accessible explanatory affordance used across Insights.
 *
 * A small "i" trigger button that reveals caller-supplied explanatory content
 * (the counting model, exclusions, logged-vs-confirmed, the active filters/scope,
 * the estimate caveat, etc.). It is wired into every KPI card, chart, share chip,
 * and empty/insufficient/unavailable state.
 *
 * Accessibility (the boundary, not decoration):
 *  - Reveals on HOVER, keyboard FOCUS, and CLICK/TAP - never hover-only - so
 *    keyboard and touch users can read the explanation.
 *  - The trigger carries aria-label + aria-expanded + aria-describedby; the
 *    revealed popover is role="tooltip" with a stable id the trigger points at,
 *    so assistive tech announces the content.
 *  - Escape closes and returns focus to the trigger; an outside click closes
 *    (a document mousedown listener that ignores presses inside the affordance).
 *    Hover-out closes a hover-opened popover.
 *  - Respects prefers-reduced-motion: the fade/translate intro is suppressed
 *    when the user asks for reduced motion (the content still appears instantly).
 *
 * Content is supplied by callers via children (or the `content` prop); this
 * component owns only the affordance + a11y, never the copy.
 */
import * as React from 'react'
import { Info } from '@/lib/icons'
import { cn } from '@/lib/utils'

let infoSeq = 0
function useTooltipId() {
  // A stable per-instance id so the trigger's aria-describedby can point at the
  // popover. useId would also work; a monotonic counter keeps the rendered id
  // short and deterministic per mount.
  const ref = React.useRef<string | null>(null)
  if (ref.current === null) {
    infoSeq += 1
    ref.current = `metric-info-${infoSeq}`
  }
  return ref.current
}

export interface MetricInfoProps {
  /** Visible-intent label used as the accessible name when no ariaLabel is given. */
  label: string
  /** Explicit accessible name override for the trigger (falls back to `label`). */
  ariaLabel?: string
  /** Explanatory content (counting / exclusions / scope / estimate caveat). */
  content?: React.ReactNode
  children?: React.ReactNode
  /** Trigger size in px (the icon glyph scales with it). */
  size?: number
  className?: string
}

export function MetricInfo({
  label,
  ariaLabel,
  content,
  children,
  size = 16,
  className,
}: MetricInfoProps) {
  const [open, setOpen] = React.useState(false)
  // Tracks whether the current open was auto-opened (hover OR focus) vs explicitly
  // made sticky by a click. A hover-out only closes an auto-open; a click promotes
  // an auto-open to sticky (so it survives the pointer leaving), and a click on a
  // sticky-open toggles it closed. This is needed because pointer interaction
  // fires mouseenter/focus (auto-open) BEFORE the click, so a naive toggle would
  // close on the very click that opened it.
  const autoOpen = React.useRef(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const tooltipId = useTooltipId()
  const reduceMotion = usePrefersReducedMotion()

  const body = content ?? children
  const accessibleName = ariaLabel ?? label

  const containerRef = React.useRef<HTMLSpanElement>(null)

  const close = React.useCallback((returnFocus: boolean) => {
    setOpen(false)
    autoOpen.current = false
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  // Outside-click dismissal via a document listener (robust regardless of stacking
  // / hit-testing): a pointer press anywhere outside the trigger+popover closes it
  // without stealing focus. Only attached while open.
  React.useEffect(() => {
    if (!open) return
    function onDocPointerDown(e: MouseEvent) {
      const node = containerRef.current
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        close(false)
      }
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [open, close])

  return (
    <span
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      className={className}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={accessibleName}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => {
          if (open && autoOpen.current) {
            // Auto-opened (hover/focus) then clicked: promote to sticky so it
            // survives the pointer leaving; do not close on the opening click.
            autoOpen.current = false
            return
          }
          // Sticky-open -> close; closed -> open (sticky).
          autoOpen.current = false
          setOpen((o) => !o)
        }}
        onMouseEnter={() => {
          if (!open) autoOpen.current = true
          setOpen(true)
        }}
        onMouseLeave={() => {
          if (autoOpen.current) close(false)
        }}
        onFocus={() => {
          if (!open) autoOpen.current = true
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation()
            close(true)
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size + 6,
          height: size + 6,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          borderRadius: 999,
          cursor: 'pointer',
          verticalAlign: 'middle',
        }}
      >
        <Info size={size} aria-hidden="true" />
      </button>

      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(!reduceMotion && 'metric-info-enter')}
          style={{
            position: 'absolute',
            top: size + 12,
            left: 0,
            zIndex: 50,
            width: 260,
            maxWidth: 'calc(100vw - 32px)',
            padding: '10px 12px',
            background: 'var(--popover)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
            fontSize: 13,
            lineHeight: 1.5,
            fontWeight: 400,
            textAlign: 'left',
            whiteSpace: 'normal',
          }}
        >
          {body}
        </span>
      )}
    </span>
  )
}

/**
 * Reads the OS reduced-motion preference. SSR-safe (defaults to false until the
 * effect runs in the browser). When true, callers suppress the intro transition.
 */
function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduce
}
