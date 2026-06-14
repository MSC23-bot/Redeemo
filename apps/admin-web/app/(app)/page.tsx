'use client'

/**
 * Authenticated landing.
 *
 * M1 is auth + shell only — no queue, review, actioner, notifications, or
 * merchant UI. This panel confirms the operator is signed in, shows their role,
 * and notes that the working tools arrive in later milestones.
 */
import { CheckCircle2 } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function DashboardPage() {
  const { role, email } = useSession()

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </span>
          <CardTitle>You are signed in</CardTitle>
          <CardDescription>
            {email ? `Signed in as ${email}.` : 'Your admin session is active.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border bg-secondary/40 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Role</span>
            <div className="font-medium text-foreground">{role ?? 'Unknown'}</div>
          </div>
          <p className="text-sm text-muted-foreground">
            The merchant approval queue and review tools arrive in a later
            milestone. For now this confirms your sign-in and access level.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
