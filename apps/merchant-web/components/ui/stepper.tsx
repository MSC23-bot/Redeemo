import * as React from 'react'
import { cn } from '@/lib/utils'

// Stepper: presentational onboarding-staircase primitive. State-driven only - the
// gating logic (which step is current/locked) lives in F1, NOT here. Renders an
// ordered step list, exposes each step's state via `data-state` for styling +
// assertions, marks the current step with aria-current, and draws an accessible
// brand red->coral gradient progress bar from the count of `done` steps.

export type StepState = 'done' | 'current' | 'in-progress' | 'locked' | 'todo'

export interface Step {
  id: string
  label: string
  state: StepState
  /** Optional helper line under the label (e.g. "Pick your category"). */
  description?: string
}

interface StepperProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  steps: Step[]
  /** When given (with totalSteps), renders a "Setup step N of M" caption. */
  activeStep?: number
  totalSteps?: number
}

// Per-state index dot styling (brand-gradient when done/current, navy ring when
// in-progress, muted when locked/todo). Token hexes per the design-system note.
const DOT_BY_STATE: Record<StepState, React.CSSProperties> = {
  done: { background: 'linear-gradient(135deg,#E20C04,#E84A00)', color: '#FFFFFF', borderColor: 'transparent' },
  current: { background: 'linear-gradient(135deg,#E20C04,#E84A00)', color: '#FFFFFF', borderColor: 'transparent' },
  'in-progress': { background: '#FFFFFF', color: '#010C35', borderColor: '#010C35' },
  locked: { background: '#F3F4F6', color: '#9CA3AF', borderColor: '#E5E7EB' },
  todo: { background: '#FFFFFF', color: '#6B7390', borderColor: '#D1D5DB' },
}

export function Stepper({ steps, activeStep, totalSteps, className, ...props }: StepperProps) {
  const total = steps.length
  const doneCount = steps.filter((s) => s.state === 'done').length
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100)
  const showCaption = typeof activeStep === 'number' && typeof totalSteps === 'number'

  return (
    <div data-slot="stepper" className={cn('flex flex-col gap-3', className)} {...props}>
      {showCaption ? (
        <span
          className="inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: '#FEF0EE', color: '#E84A00' }}
        >
          Setup step {activeStep} of {totalSteps}
        </span>
      ) : null}

      {/* Brand-gradient progress bar */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Onboarding progress"
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: '#F3F4F6' }}
      >
        <div
          data-testid="stepper-progress-fill"
          // Gradient via className (jsdom-safe; button.tsx convention); width stays
          // inline because it is dynamic per progress.
          className="h-full rounded-full bg-[linear-gradient(135deg,#E20C04_0%,#E84A00_100%)] transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li
            key={step.id}
            data-state={step.state}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={cn(
              'flex items-start gap-3 rounded-[14px] border p-3 transition-colors',
              step.state === 'current'
                ? 'border-[#E20C04] bg-[#FEF6F5]'
                : step.state === 'locked'
                  ? 'border-[#E5E7EB] bg-[#F8F9FA] opacity-70'
                  : 'border-[#E5E7EB] bg-white',
            )}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
              style={DOT_BY_STATE[step.state]}
            >
              {step.state === 'done' ? '✓' : i + 1}
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-[#010C35]">{step.label}</span>
              {step.description ? (
                <span className="text-xs text-[#6B7390]">{step.description}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
