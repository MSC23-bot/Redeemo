'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Props = {
  activeFilterCount: number
  onFilterToggle: () => void
}

export function SearchBar({ activeFilterCount, onFilterToggle }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set('q', value)
      } else {
        params.delete('q')
      }
      params.delete('offset')
      router.push(`/search?${params.toString()}`)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-3 px-6 py-4 bg-[#FAF8F5] border-b border-navy/[0.06] sticky top-[64px] z-10">
      <div className="relative flex-1">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30 text-[16px]" aria-hidden>
          🔍
        </span>
        <input
          type="search"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Search businesses, categories…"
          className="w-full bg-white border border-navy/[0.1] rounded-xl pl-10 pr-4 py-3 text-[15px] text-navy placeholder:text-navy/30 focus:outline-none focus:border-navy/30 focus:ring-2 focus:ring-navy/[0.08] transition"
        />
      </div>

      <button
        onClick={onFilterToggle}
        className="relative flex items-center gap-2 bg-white border border-navy/[0.1] rounded-xl px-4 py-3 text-[14px] text-navy/70 hover:border-navy/25 transition-colors flex-shrink-0"
      >
        <span aria-hidden>⚙</span>
        Filters
        {activeFilterCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red text-white text-[10px] font-bold flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>
  )
}
