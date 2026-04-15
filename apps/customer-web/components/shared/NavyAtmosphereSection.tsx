import type { ReactNode } from 'react'

/**
 * Navy-tone section with a subtle coral radial glow and a fine SVG grain overlay.
 * Used for high-impact hero and footer strips (e.g. /for-businesses, /about).
 * Atmosphere + grain give the surface weight without resorting to stock photography.
 */
export function NavyAtmosphereSection({
  children,
  id,
  className = '',
}: {
  children: ReactNode
  id?: string
  className?: string
}) {
  return (
    <section
      id={id}
      className={`relative overflow-hidden bg-[#010C35] ${className}`}
    >
      {/* Rose-red glow — top-right anchor + bottom-left warmth */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(640px circle at 88% -5%, rgba(226,12,4,0.26), transparent 56%), radial-gradient(480px circle at 8% 108%, rgba(200,50,0,0.16), transparent 55%)',
        }}
      />
      <div className="relative">{children}</div>
    </section>
  )
}
