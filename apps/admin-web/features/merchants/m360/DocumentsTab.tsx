'use client'

/**
 * DocumentsTab: rehomes the EXISTING MerchantDocumentsCard (spec
 * merchant-360-spec.md, Tab 7) unchanged. The card self-manages its upload +
 * delete dialogs (UploadDocumentDialog + DeleteDocumentConfirm) and their
 * mutations, so this tab is a thin, non-forking composition.
 *
 * Capability gates preserved:
 *   - View / list: `merchant:read` (the page itself; the card always renders for
 *     a viewer).
 *   - Upload + per-document Delete: `merchant:manage-documents` (SUPER_ADMIN) via
 *     `canManage`.
 *
 * Documents open via a short-lived signed link; raw storage paths are never
 * exposed (the backend redacts them, degrading to `available:false` on failure).
 */
import { MerchantDocumentsCard } from '@/features/merchants/MerchantDocumentsCard'

interface DocumentsTabProps {
  merchantId: string
  canManageDocuments: boolean
}

export function DocumentsTab({ merchantId, canManageDocuments }: DocumentsTabProps) {
  return (
    <div data-testid="workspace-documents">
      <MerchantDocumentsCard merchantId={merchantId} canManage={canManageDocuments} />
    </div>
  )
}
