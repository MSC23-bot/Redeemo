'use client'
import * as React from 'react'
import { Menu, ScanLine, Grid3x3, Bell } from '@/lib/icons'
import { Button } from '@/components/ui/button'

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#455373', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </button>
  )
}

/**
 * Top bar. M0 renders placeholder slots only (no behaviour): Validate-a-code CTA,
 * quick actions, notifications bell, account avatar. The prototype-only View-as and
 * Demo switchers are intentionally NOT built (spec exclusion).
 */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 40, height: 64,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px',
        background: 'rgba(255,255,255,0.86)', backdropFilter: 'saturate(160%) blur(8px)',
        borderBottom: '1px solid #EEF1F4',
      }}
    >
      <button type="button" aria-label="Toggle navigation" onClick={onMenu} style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#455373', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Menu size={18} />
      </button>
      <div style={{ flex: 1 }} />
      <Button variant="navy" size="default"><ScanLine size={16} /> Validate a code</Button>
      <IconButton label="Quick actions"><Grid3x3 size={18} /></IconButton>
      <IconButton label="Notifications"><Bell size={18} /></IconButton>
      <button type="button" aria-label="Account menu" style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid #E5E7EB', background: '#FEF0EE', color: '#E20C04', fontWeight: 800, fontSize: 13 }}>R</button>
    </header>
  )
}
