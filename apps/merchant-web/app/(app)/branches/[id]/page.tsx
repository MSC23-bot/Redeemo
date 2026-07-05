'use client'

/**
 * Branches PR-1 F3: the branch detail page (orchestrator). Mirrors the Vouchers
 * detail page: read the branch via useBranch(id) (React Query ['branch', id]),
 * render loading / not-found / error / success, and a back link to /branches.
 *
 * The resolved-branch layout lives in <BranchDetail>; the later tasks (F4-F11) slot
 * their section cards into its marked mount points and F13 slots locked affordances.
 * F3 renders the header, the review-state banners, and the owner-only staff card.
 *
 * Role gate (D-BM1): useBranchCapability() derives the role from the profile
 * viewerCapabilities, with a TEMPORARY owner-only staff-probe fallback for
 * pre-#364 backends (see the hook's contract comment + removal trigger). It is
 * threaded into <BranchDetail> alongside the effective per-branch capability so
 * write controls gate per the D-BM1 flip matrix. Backend asserts are the real
 * boundary.
 */
import { useParams, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from '@/lib/icons'
import { ApiError } from '@/lib/api/client'
import { useBranch } from '@/lib/branches/useBranches'
import { useBranchCapability } from '@/lib/branches/useBranchCapability'
import { effectiveCanManage } from '@/lib/branches/capability'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { BranchDetail } from '@/components/branches/BranchDetail'

export default function BranchDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id ?? ''
  const session = useSession()
  const profile = useMerchantProfile(session.isAuthenticated)

  const query = useBranch(id)
  // D-BM1: role from the profile (with the temporary owner-only skew fallback
  // inside the hook - see its removal trigger). effectiveCanManage
  // composes the role with the branch payload's capability hint; the draft
  // window keeps sensitive identity edits owner-only (merged spec §8).
  const { isOwner, ready, role } = useBranchCapability(!!id)

  const branch = query.data
  const canManage = effectiveCanManage(role, branch)
  const isDraftWindow =
    profile.data?.status === 'REGISTERED' || profile.data?.onboardingStep === 'NEEDS_CHANGES'
  // The sub-brand under the branch name. Prefer the profile (authoritative); fall
  // back to the session value the auth flow stamped.
  const businessName = profile.data?.businessName ?? session.businessName ?? null

  const notFound =
    query.isError && query.error instanceof ApiError && query.error.code === 'BRANCH_NOT_FOUND'

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.push('/branches')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B7390] hover:text-[#010C35]"
      >
        <ArrowLeft size={16} /> Back to branches
      </button>

      {query.isLoading ? (
        <Card>
          <div role="status" aria-live="polite" className="px-6 text-sm text-muted-foreground">
            Loading this branch...
          </div>
        </Card>
      ) : notFound ? (
        <Card>
          <div role="status" className="space-y-2 px-6">
            <p className="font-display text-lg font-semibold text-foreground">Branch not found</p>
            <p className="text-sm text-muted-foreground">
              This branch may have been removed, or you may not have access to it.
            </p>
          </div>
        </Card>
      ) : query.isError || !branch ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load this branch.</p>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <BranchDetail branch={branch} businessName={businessName} isOwner={isOwner} canManage={canManage} isDraftWindow={isDraftWindow} ready={ready} />
      )}
    </div>
  )
}
