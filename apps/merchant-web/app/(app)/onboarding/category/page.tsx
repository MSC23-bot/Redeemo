'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CategoryIdentityForm } from '@/components/onboarding/category/CategoryIdentityForm'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { getOnboardingTaxonomy, setMerchantIdentity, type MerchantIdentityBody } from '@/lib/api/taxonomy'
import { ApiError } from '@/lib/api/client'

// M2 F2 (D5): the category/identity onboarding step. Fetches the taxonomy + the
// merchant profile (the lifecycle source). On save it POSTs the exact identity body
// to /onboarding/identity, then invalidates the profile + onboarding reads and
// routes back to the F1 staircase hub. Defensively maps the backend error codes.

const HUB = '/'

// Defensive backend-error -> user-message map. The backend already returns a
// human-readable message, but mapping known codes keeps copy consistent and is the
// safety net the F2 plan calls for.
function identityErrorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : undefined
  switch (code) {
    case 'IDENTITY_EDIT_REQUIRES_DRAFT':
      return 'Your category can only be changed while your application is in draft. Submit an edit request instead.'
    case 'TAG_NOT_ELIGIBLE':
      return 'One or more selected options are not available for this subcategory. Please reselect and try again.'
    case 'NOT_A_SUBCATEGORY':
      return 'Please choose a specific subcategory, not a top-level category.'
    case 'CATEGORY_NOT_FOUND':
      return 'That category could not be found. Please reload and try again.'
    default:
      return 'We could not save your category just now. Please try again.'
  }
}

export default function CategoryPage() {
  const session = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const profile = useMerchantProfile(session.isAuthenticated)

  const taxonomy = useQuery({
    queryKey: ['onboardingTaxonomy'],
    queryFn: getOnboardingTaxonomy,
    enabled: session.isAuthenticated,
    staleTime: 5 * 60_000,
  })

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function goBack() {
    router.push(HUB)
  }

  if (profile.isError || taxonomy.isError) {
    return (
      <div className="space-y-6" role="alert">
        <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">We could not load your categories</CardTitle>
            <CardDescription>
              There was a problem reaching Redeemo. Check your connection and try again.
            </CardDescription>
          </CardHeader>
        </Card>
        <Button onClick={() => taxonomy.refetch()}>Try again</Button>
      </div>
    )
  }

  if (profile.isLoading || !profile.data || taxonomy.isLoading || !taxonomy.data) {
    return (
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading your categories...
      </div>
    )
  }

  // Derive the merchant's current identity for edit hydration + the change-confirm
  // gate. primaryCategoryId on the profile is the SUBCATEGORY id (M2 B2). The
  // specialty MerchantTag set is not exposed on the profile read, so only the
  // descriptor cuisine pre-fills; the change-confirm only needs the subcategory id.
  const hasExistingIdentity = !!profile.data.primaryCategoryId
  const initialIdentity: MerchantIdentityBody | null = hasExistingIdentity
    ? {
        subcategoryId: profile.data.primaryCategoryId as string,
        primaryDescriptorTagId: profile.data.primaryDescriptorTagId ?? null,
        specialtyTagIds: [],
      }
    : null

  async function handleSave(body: MerchantIdentityBody) {
    setSaving(true)
    setSaveError(null)
    try {
      await setMerchantIdentity(body)
      // Refetch the lifecycle source + onboarding reads so the hub re-derives the
      // category step as done.
      await Promise.all([
        profile.refetch(),
        queryClient.invalidateQueries({ queryKey: ['merchantProfile'] }),
        queryClient.invalidateQueries({ queryKey: ['onboardingChecklist'] }),
        queryClient.invalidateQueries({ queryKey: ['rmvActiveCount'] }),
      ])
      router.push(HUB)
    } catch (err) {
      setSaveError(identityErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <CategoryIdentityForm
      taxonomy={taxonomy.data}
      initialIdentity={initialIdentity}
      hasExistingIdentity={hasExistingIdentity}
      onSave={handleSave}
      saving={saving}
      saveError={saveError}
      onBack={goBack}
    />
  )
}
