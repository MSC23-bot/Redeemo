'use client'

/**
 * AssistedStepRail: the left rail of the assisted onboarding wizard (C2, spec
 * §A4 step rail). Nine clickable rows (free movement, spec §c "Nothing is live
 * yet · move freely"), each showing a status mark derived from the REAL draft
 * state (assistedWizard.deriveWizardState), the current step highlighted.
 *
 * Status marks (never colour-only; each carries an sr-only label + a glyph):
 *   - complete   : green tick
 *   - incomplete : amber "!" (a blocking step still needs data)
 *   - optional   : neutral "-" (never blocks go-live)
 *   - gated      : neutral lock (no admin on-behalf route; honestly gated)
 * The current step is marked separately (rose ring) regardless of its status.
 */
import { Check, AlertCircle, Minus, Lock } from 'lucide-react'
import { WIZARD_STEPS, type WizardStepStatus, type WizardStepId } from '@/lib/leads/assistedWizard'

const STATUS_LABEL: Record<WizardStepStatus, string> = {
  complete: 'Complete',
  incomplete: 'Needs attention',
  optional: 'Optional',
  gated: 'Gated',
}

function StatusMark({ status }: { status: WizardStepStatus }) {
  const common = 'size-3.5'
  if (status === 'complete') {
    return <Check className={`${common} text-emerald-600`} aria-hidden="true" />
  }
  if (status === 'incomplete') {
    return <AlertCircle className={`${common} text-amber-600`} aria-hidden="true" />
  }
  if (status === 'gated') {
    return <Lock className={`${common} text-muted-foreground`} aria-hidden="true" />
  }
  return <Minus className={`${common} text-muted-foreground`} aria-hidden="true" />
}

interface AssistedStepRailProps {
  currentStep: number
  statuses: Record<WizardStepId, WizardStepStatus>
  onGo: (num: number) => void
}

export function AssistedStepRail({ currentStep, statuses, onGo }: AssistedStepRailProps) {
  return (
    <nav
      className="w-full shrink-0 border-b border-border bg-card p-4 md:w-[270px] md:border-b-0 md:border-r"
      aria-label="Onboarding steps"
      data-testid="assisted-step-rail"
    >
      <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Build the account
      </p>
      <ol className="space-y-1">
        {WIZARD_STEPS.map((step) => {
          const status = statuses[step.id]
          const isCurrent = step.num === currentStep
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onGo(step.num)}
                aria-current={isCurrent ? 'step' : undefined}
                data-testid={`assisted-rail-step-${step.num}`}
                data-status={status}
                className={[
                  'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isCurrent ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/50',
                ].join(' ')}
              >
                <span
                  className={[
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                    isCurrent
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {step.num}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{step.title}</span>
                    <StatusMark status={status} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{step.sub}</span>
                  <span className="sr-only">{STATUS_LABEL[status]}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="mt-4 rounded-md border border-border bg-secondary/30 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Final steps</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Running the full onboarding on behalf is net-new. The owner signs the contract and sets
          their own password themselves; nothing goes live until the go-live review.
        </p>
      </div>
    </nav>
  )
}
