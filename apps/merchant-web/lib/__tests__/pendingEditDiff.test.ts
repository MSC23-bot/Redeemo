import { computePendingEditDiff } from '@/lib/pendingEditDiff'

describe('computePendingEditDiff', () => {
  const labels = {
    name: 'Branch name',
    addressLine1: 'Address line 1',
    logoUrl: 'Logo image',
    bannerUrl: 'Banner image',
  }
  const images = new Set(['logoUrl', 'bannerUrl'])

  it('returns one row per changed field, old -> new', () => {
    const rows = computePendingEditDiff(
      { addressLine1: '32 High Street' },
      { name: 'High Street', addressLine1: '12 High Street' },
      labels,
      images,
    )
    expect(rows).toEqual([
      {
        field: 'addressLine1',
        label: 'Address line 1',
        isImage: false,
        oldDisplay: '12 High Street',
        newDisplay: '32 High Street',
      },
    ])
  })

  it('skips fields not present in proposedChanges', () => {
    const rows = computePendingEditDiff(
      { name: 'New name' },
      { name: 'Old name', addressLine1: '12 High Street' },
      labels,
      images,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].field).toBe('name')
  })

  it('skips keys not in the label allow-list (e.g. add/remove photo arrays, lat/lng)', () => {
    const rows = computePendingEditDiff(
      { add: ['https://example.com/a.png'], latitude: 53.1 },
      {},
      labels,
      images,
    )
    expect(rows).toEqual([])
  })

  it('renders a friendly image row with no old/new display (never the raw URL)', () => {
    const rows = computePendingEditDiff(
      { logoUrl: 'https://cdn.example.com/logo-abc123.png' },
      { logoUrl: 'https://cdn.example.com/logo-old.png' },
      labels,
      images,
    )
    expect(rows).toEqual([
      { field: 'logoUrl', label: 'Logo image', isImage: true, oldDisplay: '', newDisplay: '' },
    ])
  })

  it('falls back to "Not set" for a null/empty current or proposed value', () => {
    const rows = computePendingEditDiff({ name: '' }, { name: null }, labels)
    expect(rows).toEqual([
      { field: 'name', label: 'Branch name', isImage: false, oldDisplay: 'Not set', newDisplay: 'Not set' },
    ])
  })

  it('returns no rows for an absent proposedChanges bag', () => {
    expect(computePendingEditDiff(undefined, { name: 'x' }, labels)).toEqual([])
    expect(computePendingEditDiff(null, { name: 'x' }, labels)).toEqual([])
  })
})
