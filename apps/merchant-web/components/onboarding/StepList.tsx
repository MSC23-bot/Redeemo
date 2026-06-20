'use client'

import { cn } from '@/lib/utils'
import type { DerivedStaircase, DerivedStep } from '@/lib/onboarding/stepState'

// M2 F1: the staircase step list. Each row carries its number/state dot, label +
// helper line, the per-step ACTION (action button on reachable steps; a locked
// hint chip on locked steps; "N of 2" / Done badges where applicable), plus the
// brand red->coral progress bar. The GATING already lives in deriveStepStates;
// this is the hub's presentation only. (The F0 <Stepper> primitive is reserved
// for the simpler caption+dots case; the hub needs per-row action affordances, so
// it renders rows here while reusing the same state-driven styling tokens.)

interface StepListProps {
  staircase: DerivedStaircase
  /** Navigate to a step's sub-route (F2-F6 pages). */
  onNavigate: (href: string) => void
}

const DOT_BY_STATE: Record<DerivedStep['state'], React.CSSProperties> = {
  done: { background: '#0F7A3E', color: '#FFFFFF', borderColor: 'transparent' },
  current: { background: '#FFF1EA', color: '#E84A00', borderColor: '#F4C3AC' },
  'in-progress': { background: '#FEF6E7', color: '#B45309', borderColor: '#E8A93A' },
  locked: { background: '#F4F6FA', color: '#B0B6C4', borderColor: '#E5E7EB' },
  todo: { background: '#FFFFFF', color: '#5b6270', borderColor: '#E0E3E8' },
}

export function StepList({ staircase, onNavigate }: StepListProps) {
  const percent = staircase.totalCount === 0 ? 0 : Math.round((staircase.doneCount / staircase.totalCount) * 100)

  return (
    <div className="flex flex-col gap-3">
      {/* Brand red->coral progress bar */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Onboarding progress"
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: '#F1E7E1' }}
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#E20C04_0%,#E84A00_100%)] transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="flex flex-col gap-1">
        {staircase.steps.map((step, i) => (
          <StepRow key={step.id} step={step} index={i} onNavigate={onNavigate} />
        ))}
      </ol>
    </div>
  )
}

function StepRow({ step, index, onNavigate }: { step: DerivedStep; index: number; onNavigate: (href: string) => void }) {
  return (
    <li
      data-step-id={step.id}
      data-state={step.state}
      aria-current={step.current ? 'step' : undefined}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-[12px] p-3 transition-colors',
        step.current ? 'bg-[#FFFBF8]' : '',
        step.locked ? 'opacity-80' : '',
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-[26px] shrink-0 items-center justify-center rounded-full border text-xs font-bold"
        style={DOT_BY_STATE[step.state]}
      >
        {step.done ? '✓' : index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[15px] font-bold"
            style={{ color: step.locked ? '#A0A6B5' : '#010C35' }}
          >
            {step.label}
          </span>
          {step.progress ? (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
              style={{ background: '#FEF6E7', color: '#B45309', border: '1px solid #F4D9A8' }}
            >
              {step.progress}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-[13px] leading-relaxed" style={{ color: step.locked ? '#B0B6C4' : '#6B7390' }}>
          {step.description}
        </div>
        {step.locked && step.lockedHint ? (
          <span
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
            style={{ background: '#F4F6FA', color: '#8089A4', border: '1px solid #E5E7EB' }}
          >
            {step.lockedHint}
          </span>
        ) : null}
      </div>

      {step.done ? (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0F7A3E]">Done</span>
      ) : null}

      {!step.locked && step.action ? (
        <button
          type="button"
          onClick={() => onNavigate(step.href)}
          className={
            step.current
              ? 'inline-flex items-center rounded-[10px] bg-[#010C35] px-3.5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#1b264f]'
              : 'inline-flex items-center rounded-[10px] border border-[#D7DBE2] bg-white px-3.5 py-2 text-[13px] font-bold text-[#1F2A4A] transition-colors hover:bg-[#F8F9FA]'
          }
        >
          {step.action}
        </button>
      ) : null}
    </li>
  )
}
