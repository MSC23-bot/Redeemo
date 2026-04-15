import Link from 'next/link'
import type { ReactNode } from 'react'

type SiblingLink = { href: string; label: string }

type Props = {
  eyebrow: string
  title: string
  updated: string       // e.g. "15 April 2026"
  siblings: SiblingLink[]
  children: ReactNode
}

/**
 * Shared wrapper for legal / policy pages.
 * Navy hero → off-white content area with sidebar sibling links.
 */
export function LegalShell({ eyebrow, title, updated, siblings, children }: Props) {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#010C35] py-16 md:py-20 px-6">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(500px circle at 92% -8%, rgba(226,12,4,0.22), transparent 55%), radial-gradient(360px circle at 5% 110%, rgba(200,50,0,0.14), transparent 55%)',
          }}
        />
        <div className="relative max-w-7xl mx-auto">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/30 mb-4">
            {eyebrow}
          </p>
          <h1
            className="font-display text-white leading-[1.08]"
            style={{ fontSize: 'clamp(30px, 4vw, 48px)', letterSpacing: '-0.4px' }}
          >
            {title}
          </h1>
          <p className="text-[12px] text-white/28 mt-4">
            Last updated: {updated}
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="bg-[#F8F7F5] min-h-screen">
        <div className="max-w-7xl mx-auto px-6 py-14 lg:flex lg:gap-14">

          {/* Sidebar: other legal pages */}
          <aside className="hidden lg:flex flex-col gap-1 w-52 flex-shrink-0 sticky top-28 self-start">
            <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#9CA3AF] px-4 mb-3">
              Legal
            </p>
            {siblings.map(s => (
              <Link
                key={s.href}
                href={s.href}
                className={`text-left px-4 py-2.5 rounded-lg text-[13px] transition-colors no-underline ${
                  s.label === title
                    ? 'bg-white text-[#010C35] font-semibold border-l-2 border-[#E20C04] rounded-l-none shadow-sm'
                    : 'text-[#4B5563] hover:text-[#010C35] hover:bg-white'
                }`}
              >
                {s.label}
              </Link>
            ))}
          </aside>

          {/* Prose */}
          <main className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl border border-[#EDE8E8] px-8 py-10 md:px-12 md:py-12 prose-legal">
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
