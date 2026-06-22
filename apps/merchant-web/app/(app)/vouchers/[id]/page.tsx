'use client'

/**
 * Day-2 Vouchers B4: the per-state voucher detail page. Reads the full custom
 * voucher via getVoucher (React Query ['voucher', id]) and renders the read-only
 * VoucherDetail for every safe state. The B5 action menu (Edit / Submit / Delete /
 * Duplicate) and the B6 concierge edit flow mount here in those slices.
 *
 * Privacy: only safe core voucher fields are shown. Never customer PII or a PIN.
 */
import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from '@/lib/icons'
import { getVoucher } from '@/lib/api/voucher'
import { VoucherDetail } from '@/components/vouchers/VoucherDetail'

export default function VoucherDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id ?? ''

  const query = useQuery({
    queryKey: ['voucher', id],
    queryFn: () => getVoucher(id),
    enabled: !!id,
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.push('/vouchers')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B7390] hover:text-[#010C35]"
      >
        <ArrowLeft size={16} /> Back to vouchers
      </button>

      {query.isLoading ? (
        <Card>
          <div role="status" aria-live="polite" className="px-6 text-sm text-muted-foreground">
            Loading this voucher...
          </div>
        </Card>
      ) : query.isError || !query.data ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load this voucher.</p>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <VoucherDetail voucher={query.data} />
      )}
    </div>
  )
}
