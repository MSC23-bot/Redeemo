import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Chip, type VoucherType } from '@/components/ui/chip'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from '@/components/ui/table'
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
        <Button variant="navy">Navy (secondary)</Button>
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
      <Section title="Cards">
        {/* Cards sit on a white panel so the cream surface reads distinctly against the cream page. */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 14, padding: 16 }}>
          <Card style={{ width: 240 }}>
            <CardHeader><CardTitle>Default card</CardTitle></CardHeader>
            <CardContent>White surface with a navy soft shadow.</CardContent>
          </Card>
          <Card className="bg-cream" style={{ width: 240 }}>
            <CardHeader><CardTitle>Cream card</CardTitle></CardHeader>
            <CardContent>Warm cream surface for identity moments.</CardContent>
          </Card>
        </div>
      </Section>
      <Section title="Form fields">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
          <Label htmlFor="biz-name">Business name</Label>
          <Input id="biz-name" placeholder="The Old Foundry Kitchen" />
        </div>
      </Section>
      <Section title="Table">
        <div style={{ width: '100%', maxWidth: 520 }}>
          <Table>
            <THead>
              <TR><TH>Voucher</TH><TH>Redemptions</TH></TR>
            </THead>
            <TBody>
              <TR><TD>Buy one, get one free</TD><TD>118</TD></TR>
            </TBody>
          </Table>
          <TableEmpty>No redemptions to show yet.</TableEmpty>
        </div>
      </Section>
    </div>
  )
}
