'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// Toast: save-feedback primitive for the onboarding flow. A `ToastProvider` holds
// the toast queue + renders the stack in a fixed viewport region; `useToast()`
// returns `toast()` to enqueue one. Toasts auto-dismiss after `durationMs`.
//
// Accessibility: a success toast uses role="status" (polite); an error toast uses
// role="alert" (assertive) so it is announced immediately. Each carries
// `data-variant` for styling + assertions.

export type ToastVariant = 'success' | 'error'

export interface ToastOptions {
  message: string
  variant?: ToastVariant
  /** Auto-dismiss delay in ms (default 5000). */
  durationMs?: number
}

interface ToastItem extends Required<Omit<ToastOptions, 'durationMs'>> {
  id: number
  durationMs: number
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION = 5000

let counter = 0
function nextId(): number {
  counter += 1
  return counter
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback(
    ({ message, variant = 'success', durationMs = DEFAULT_DURATION }: ToastOptions) => {
      const id = nextId()
      setItems((prev) => [...prev, { id, message, variant, durationMs }])
    },
    [],
  )

  const value = React.useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), item.durationMs)
    return () => clearTimeout(timer)
  }, [item.id, item.durationMs, onDismiss])

  const isError = item.variant === 'error'
  return (
    <div
      role={isError ? 'alert' : 'status'}
      data-variant={item.variant}
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-[14px] border px-4 py-3 text-sm font-medium shadow-[0_10px_30px_rgba(1,12,53,0.10)]',
        isError
          ? 'border-[#FBCED0] bg-[#FEECEC] text-[#B91C1C]'
          : 'border-[#BDE5CB] bg-[#E9F7EF] text-[#0F7A3E]',
      )}
    >
      <span
        aria-hidden="true"
        className="mt-1 size-2 shrink-0 rounded-full"
        style={{ background: isError ? '#B91C1C' : '#0F7A3E' }}
      />
      <span>{item.message}</span>
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>.')
  }
  return ctx
}
