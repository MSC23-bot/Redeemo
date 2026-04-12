'use client'
import { motion } from 'framer-motion'

type MonthData = { month: string; saving: number; count: number }

export function SavingsChart({ data }: { data: MonthData[] }) {
  // data[0] = current month, data[11] = 11 months ago — display oldest-first (reverse)
  const displayed = [...data].reverse()
  const maxSaving = Math.max(...displayed.map(d => d.saving), 1)

  return (
    <div className="bg-white border border-navy/[0.08] rounded-2xl p-6">
      <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-6">
        Monthly savings — last 12 months
      </p>

      <div className="flex items-end gap-2 h-[120px]">
        {displayed.map((d, i) => {
          const heightPct = maxSaving > 0 ? (d.saving / maxSaving) * 100 : 0
          const label = d.month.slice(5) // "MM" from "YYYY-MM"

          return (
            <div key={d.month} className="flex flex-col items-center gap-1 flex-1 group">
              {/* Bar */}
              <div className="w-full flex items-end flex-1">
                <motion.div
                  className="w-full rounded-t-md"
                  style={{
                    background: 'linear-gradient(to top, #E2000C, #EE6904)',
                    minHeight: d.saving > 0 ? 4 : 2,
                    opacity: d.saving > 0 ? 1 : 0.15,
                  }}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${heightPct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.04, ease: 'easeOut' }}
                />
              </div>
              {/* Month label */}
              <span className="font-mono text-[9px] text-navy/30 tracking-wide">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
