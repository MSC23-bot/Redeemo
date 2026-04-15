'use client'
import { useRouter, useSearchParams } from 'next/navigation'

type Category = { id: string; name: string }

export function CategoryFilterBar({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const active = searchParams.get('categoryId')

  function setCategory(id: string | null) {
    const next = new URLSearchParams(searchParams.toString())
    if (id) next.set('categoryId', id)
    else next.delete('categoryId')
    router.push(`/discover${next.toString() ? `?${next}` : ''}`, { scroll: false })
  }

  return (
    <div className="sticky top-[64px] z-20 bg-white/95 backdrop-blur-sm border-b border-[#EDE8E8]">
      <div className="max-w-7xl mx-auto">
        <div
          role="tablist"
          aria-label="Filter by category"
          className="overflow-x-auto scrollbar-none"
        >
          <div className="flex items-center gap-2 px-6 py-3 min-w-max">
            <Pill active={!active} onClick={() => setCategory(null)}>
              All
            </Pill>
            {categories.map(cat => (
              <Pill
                key={cat.id}
                active={active === cat.id}
                onClick={() => setCategory(cat.id)}
              >
                {cat.name}
              </Pill>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-shrink-0 h-10 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all ${
        active
          ? 'text-white shadow-[0_2px_10px_rgba(226,12,4,0.22)]'
          : 'text-[#374151] bg-[#F2F0EC] border border-[#C9C3BB] hover:border-[#010C35]/40 hover:bg-[#EAE7E1] hover:text-[#010C35]'
      }`}
      style={active ? { background: 'var(--brand-gradient)' } : undefined}
    >
      {children}
    </button>
  )
}
