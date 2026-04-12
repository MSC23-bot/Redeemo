'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'

export type FilterState = {
  sortBy: 'relevance' | 'nearest' | 'top_rated' | 'highest_saving'
  voucherTypes: string[]
  openNow: boolean
}

type Props = {
  isOpen: boolean
  onClose: () => void
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
}

const SORT_OPTIONS: { value: FilterState['sortBy']; label: string }[] = [
  { value: 'relevance',      label: 'Best match' },
  { value: 'nearest',        label: 'Nearest first' },
  { value: 'top_rated',      label: 'Top rated' },
  { value: 'highest_saving', label: 'Highest saving' },
]

const VOUCHER_TYPES = ['BOGO', 'DISCOUNT', 'FREEBIE', 'PACKAGE_DEAL', 'TIME_LIMITED', 'REUSABLE']
const VOUCHER_TYPE_LABELS: Record<string, string> = {
  BOGO: 'Buy one get one', DISCOUNT: 'Discount', FREEBIE: 'Freebie',
  PACKAGE_DEAL: 'Package deal', TIME_LIMITED: 'Time limited', REUSABLE: 'Reusable',
}

export function FilterDrawer({ isOpen, onClose, filters, onFiltersChange }: Props) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const toggleVoucherType = (type: string) => {
    const next = filters.voucherTypes.includes(type)
      ? filters.voucherTypes.filter(t => t !== type)
      : [...filters.voucherTypes, type]
    onFiltersChange({ ...filters, voucherTypes: next })
  }

  const hasActiveFilters =
    filters.sortBy !== 'relevance' ||
    filters.voucherTypes.length > 0 ||
    filters.openNow

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="drawer"
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col lg:hidden"
          >
            <DrawerContent
              filters={filters}
              onFiltersChange={onFiltersChange}
              onClose={onClose}
              hasActiveFilters={hasActiveFilters}
              toggleVoucherType={toggleVoucherType}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 sticky top-24 self-start">
        <DrawerContent
          filters={filters}
          onFiltersChange={onFiltersChange}
          onClose={onClose}
          hasActiveFilters={hasActiveFilters}
          toggleVoucherType={toggleVoucherType}
          isDesktop
        />
      </aside>
    </>
  )
}

function DrawerContent({
  filters, onFiltersChange, onClose, hasActiveFilters, toggleVoucherType, isDesktop = false,
}: {
  filters: FilterState
  onFiltersChange: (f: FilterState) => void
  onClose: () => void
  hasActiveFilters: boolean
  toggleVoucherType: (t: string) => void
  isDesktop?: boolean
}) {
  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-8">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[20px] text-navy">Filters</h2>
        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <button
              onClick={() => onFiltersChange({ sortBy: 'relevance', voucherTypes: [], openNow: false })}
              className="font-mono text-[11px] tracking-wide text-red underline"
            >
              Clear all
            </button>
          )}
          {!isDesktop && (
            <button onClick={onClose} className="text-navy/40 hover:text-navy text-xl" aria-label="Close filters">
              ✕
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/40 mb-3">Sort by</p>
        <div className="flex flex-col gap-2">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onFiltersChange({ ...filters, sortBy: opt.value })}
              className={`text-left text-[14px] px-4 py-2.5 rounded-xl border transition-colors ${
                filters.sortBy === opt.value
                  ? 'bg-navy text-white border-navy'
                  : 'text-navy/70 border-navy/[0.1] hover:border-navy/25'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/40 mb-3">Voucher type</p>
        <div className="flex flex-col gap-2">
          {VOUCHER_TYPES.map(type => {
            const checked = filters.voucherTypes.includes(type)
            return (
              <label key={type} className="flex items-center gap-3 cursor-pointer group">
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center border flex-shrink-0 transition-colors ${
                    checked ? 'bg-red border-red' : 'border-navy/20 group-hover:border-navy/40'
                  }`}
                  onClick={() => toggleVoucherType(type)}
                >
                  {checked && <span className="text-white text-[11px]">✓</span>}
                </span>
                <span className="text-[14px] text-navy/70">{VOUCHER_TYPE_LABELS[type]}</span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[14px] text-navy/70">Open now</p>
        <button
          onClick={() => onFiltersChange({ ...filters, openNow: !filters.openNow })}
          className={`relative w-11 h-6 rounded-full transition-colors ${filters.openNow ? 'bg-red' : 'bg-navy/15'}`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              filters.openNow ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
