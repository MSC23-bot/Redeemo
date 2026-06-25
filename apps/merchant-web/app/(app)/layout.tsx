import { MerchantPortalShell } from '@/components/shell/MerchantPortalShell'
import { ToastProvider } from '@/components/ui/toast'

// The ToastProvider must wrap every authenticated (app) route: the onboarding
// "Add your main branch" step and the day-2 branch detail section cards
// (Contact/Hours/PIN/Amenities/Branding) all call useToast(), which THROWS
// "useToast must be used within a <ToastProvider>" when no ancestor provides it.
// Without this wrapper those routes crash with a blank-page client-side exception
// (the unit tests passed only because each wrapped its component in a ToastProvider
// directly). Mounting it here gives every (app) page the save-feedback toast.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <MerchantPortalShell>{children}</MerchantPortalShell>
    </ToastProvider>
  )
}
