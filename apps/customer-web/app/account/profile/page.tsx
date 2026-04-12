import type { Metadata } from 'next'
import { profileApi } from '@/lib/api'
import { AccountNav } from '@/components/account/AccountNav'
import { ProfileForm } from '@/components/account/ProfileForm'

export const metadata: Metadata = { title: 'Edit Profile' }

export default async function ProfilePage() {
  let profile = null
  try {
    profile = await profileApi.get()
  } catch {
    profile = null
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav variant="mobile" />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />
        <main className="flex-1">
          <div className="mb-8">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-2">Account</p>
            <h1 className="font-display text-[clamp(26px,4vw,38px)] text-navy leading-none">Edit Profile</h1>
          </div>
          {profile
            ? <ProfileForm profile={profile} />
            : <p className="text-[14px] text-navy/45">Could not load profile. Please refresh.</p>
          }
        </main>
      </div>
    </div>
  )
}
