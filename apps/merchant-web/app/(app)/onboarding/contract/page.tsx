'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ContractAgreementForm } from '@/components/onboarding/contract/ContractAgreementForm'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { getContract, acceptContract } from '@/lib/api/onboarding'
import { ApiError } from '@/lib/api/client'

// M2 F6 (D9-D10): the merchant-agreement onboarding step. The FINAL onboarding step.
// Fetches the canonical contract (version + draft text) from the backend, renders the
// click-to-agree form, and on accept POSTs /onboarding/contract/accept with the
// fetched version. Accepting marks contractStatus SIGNED (the checklist
// contract_signed gate); it does NOT submit the business for review. The final
// submit is the F1 hub Submit. On success it shows the signed-confirmation state,
// invalidates the onboarding reads so the hub re-derives the agreement step as done,
// and routes back to the hub.
//
// Owner-by-absence (M2): the contract framing is "owner only" but no code role-gate
// is added; the explicit OWNER role-gate is an M3 security follow-up.

const HUB = '/'

export default function ContractPage() {
  const session = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const profile = useMerchantProfile(session.isAuthenticated)

  const contract = useQuery({
    queryKey: ['onboardingContract'],
    queryFn: getContract,
    enabled: session.isAuthenticated,
    staleTime: 5 * 60_000,
  })

  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [signed, setSigned] = useState(false)

  function goBack() {
    router.push(HUB)
  }

  if (contract.isError || profile.isError) {
    return (
      <div className="space-y-6" role="alert">
        <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">We could not load the agreement</CardTitle>
            <CardDescription>
              There was a problem reaching Redeemo. Check your connection and try again.
            </CardDescription>
          </CardHeader>
        </Card>
        <Button onClick={() => contract.refetch()}>Try again</Button>
      </div>
    )
  }

  if (contract.isLoading || !contract.data || profile.isLoading || !profile.data) {
    return (
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading the agreement...
      </div>
    )
  }

  async function handleAccept() {
    if (!contract.data) return
    setAccepting(true)
    setAcceptError(null)
    try {
      await acceptContract(contract.data.version)
      await afterSigned()
    } catch (err) {
      // Defensive: if the backend says it is already signed, treat the step as done
      // (the desired end-state is reached) rather than surfacing an error.
      const code = err instanceof ApiError ? err.code : undefined
      if (code === 'CONTRACT_ALREADY_SIGNED') {
        await afterSigned()
        return
      }
      setAcceptError('We could not record your agreement just now. Please try again.')
    } finally {
      setAccepting(false)
    }
  }

  // Flip to the signed-confirmation state and route back to the hub immediately;
  // the lifecycle + onboarding-reads refresh is fired non-blocking so a stalled
  // refetch can never leave the merchant stuck on this step after the contract has
  // already been accepted server-side. The hub re-derives the agreement step as
  // done once those queries resolve. This NEVER submits the business: the F1 hub
  // Submit is the only path that POSTs /onboarding/submit.
  async function afterSigned() {
    setSigned(true)
    void Promise.all([
      profile.refetch?.(),
      queryClient.invalidateQueries({ queryKey: ['onboardingChecklist'] }),
      queryClient.invalidateQueries({ queryKey: ['onboardingStatus'] }),
    ])
    router.push(HUB)
  }

  return (
    <ContractAgreementForm
      contract={contract.data}
      signerBusinessName={profile.data.businessName}
      signed={signed}
      accepting={accepting}
      acceptError={acceptError}
      onAccept={handleAccept}
      onBack={goBack}
    />
  )
}
