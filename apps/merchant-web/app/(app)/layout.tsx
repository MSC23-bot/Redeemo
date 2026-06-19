import { MerchantPortalShell } from '@/components/shell/MerchantPortalShell'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <MerchantPortalShell>{children}</MerchantPortalShell>
}
