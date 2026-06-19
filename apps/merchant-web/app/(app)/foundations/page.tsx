import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Chip, type VoucherType } from '@/components/ui/chip'
import { StatusPill, type LifecycleState } from '@/components/shell/StatusPill'

export const metadata = { robots: { index: false, follow: false } }

const STATES: LifecycleState[] = ['setup', 'submitted', 'in_review', 'changes', 'live', 'live_new', 'suspended']
const TYPES: VoucherType[] = ['bogo', 'discount', 'freebie', 'spendsave', 'package', 'timelimited', 'reusable']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 12 }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>{children}</div>
    </section>
  )
}

export default function FoundationsPage() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginBottom: 24 }}>Foundations</h1>
      <Section title="Buttons">
        <Button variant="gradient">Save voucher</Button>
        <Button variant="navy">Validate a code</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Delete</Button>
      </Section>
      <Section title="Status pills">
        {STATES.map((s) => <StatusPill key={s} state={s} />)}
      </Section>
      <Section title="Voucher-type chips">
        {TYPES.map((t) => <Chip key={t} type={t}>{t}</Chip>)}
      </Section>
      <Section title="Badges">
        <Badge variant="neutral">Neutral</Badge>
        <Badge variant="caution">Caution</Badge>
        <Badge variant="restrictive">Restrictive</Badge>
      </Section>
    </div>
  )
}
