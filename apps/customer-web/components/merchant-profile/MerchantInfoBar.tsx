'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'

type Props = {
  merchantName: string
  phone: string | null
  websiteUrl: string | null
  directionsUrl: string | null
}

export function MerchantInfoBar({
  merchantName,
  phone,
  websiteUrl,
  directionsUrl,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.6 }}
      className="max-w-7xl mx-auto px-6 py-6 border-b border-[#EDE8E8]"
    >
      {/* Contact row */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5 text-[14px]">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-2 text-[#4B5563] no-underline hover:text-[#010C35] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[#E20C04]">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <span className="font-medium">{phone}</span>
          </a>
        )}
        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[#4B5563] no-underline hover:text-[#010C35] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[#E20C04]">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="font-medium">
              {websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            </span>
          </a>
        )}
      </div>

      {/* Action row */}
      <div className="flex flex-wrap gap-3">
        <ShareButton merchantName={merchantName} />
        {directionsUrl && (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13.5px] font-semibold text-white no-underline transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand-gradient)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
            Get directions
          </a>
        )}
      </div>
    </motion.div>
  )
}

function ShareButton({ merchantName }: { merchantName: string }) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    if (typeof window === 'undefined') return
    const url = window.location.href
    const title = `${merchantName} on Redeemo`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // user cancelled or share failed, fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // no-op
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-live="polite"
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#D1D5DB] text-[13.5px] font-semibold text-[#010C35] hover:border-[#010C35]/40 transition-colors"
      style={{ background: '#F3F4F6' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      {copied ? 'Link copied' : 'Share'}
    </button>
  )
}
