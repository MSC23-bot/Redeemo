'use client'

/**
 * Create merchant draft page: /merchants/new
 *
 * Gated on the `merchant:create-draft` capability:
 *   - session not ready -> loader
 *   - lacks merchant:create-draft -> forbidden state
 *   - authorised -> CreateDraftForm
 *
 * Backend enforcement stays defence-in-depth; this is UI gating only.
 */
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertCircle, UserPlus } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { CreateDraftForm } from '@/features/merchants/CreateDraftForm'

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20" data-testid="create-draft-loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

function ForbiddenState() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center" data-testid="create-draft-forbidden">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mb-2 text-lg font-semibold text-foreground">Access denied</h2>
      <p className="text-sm text-muted-foreground">
        You do not have permission to create merchant drafts. Contact your administrator.
      </p>
    </div>
  )
}

export default function CreateMerchantDraftPage() {
  const { ready, can } = useSession()

  if (!ready) {
    return <LoadingState />
  }

  if (!can('merchant:create-draft')) {
    return <ForbiddenState />
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/queue"
          className="flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Back to approval queue"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Approval queue</span>
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">New merchant draft</span>
      </nav>

      {/* Heading */}
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <UserPlus className="size-4" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold text-foreground">Create merchant draft</h1>
      </div>

      <CreateDraftForm />
    </div>
  )
}
