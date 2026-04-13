'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { profileApi, ApiError } from '@/lib/api'
import { AccountNav } from '@/components/account/AccountNav'
import { ProfileForm } from '@/components/account/ProfileForm'

function ProfileSkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-5 max-w-lg">
      {[0, 1, 2, 3].map(i => (
        <div key={i}>
          <div className="h-3 w-20 bg-navy/[0.06] rounded mb-2" />
          <div className="h-10 w-full bg-navy/[0.04] rounded-xl" />
        </div>
      ))}
    </div>
  )
}

type Profile = Parameters<typeof ProfileForm>[0]['profile']

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    profileApi.get()
      .then(data => {
        setProfile(data as Profile)
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.statusCode === 401) {
          router.push('/login?next=/account/profile')
          return
        }
        setError(true)
        setIsLoading(false)
      })
  }, [router])

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
          {isLoading ? (
            <ProfileSkeleton />
          ) : error ? (
            <p className="text-[14px] text-navy/45">Could not load profile. Please refresh.</p>
          ) : profile ? (
            <ProfileForm profile={profile} />
          ) : null}
        </main>
      </div>
    </div>
  )
}
