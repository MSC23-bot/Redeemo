import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </span>
          <CardTitle className="text-2xl">Redeemo Admin</CardTitle>
          <CardDescription>Operations console</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Sign in to manage merchants, approvals, and reporting.
          </p>
          <Button className="w-full" disabled>
            Sign in
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
