import { isEvidenceUiEnabled } from '@/lib/flags'

// The release gate MUST fail closed: only the exact literal 'true' enables it. Everything else,
// including unset / 'false' / case variants / truthy-looking strings / whitespace, is OFF. This is
// the load-bearing property that lets D65 lane-2 merge dormant to `main` (which auto-deploys the
// admin web) without exposing controls before the backend + D65 columns are live.
describe('isEvidenceUiEnabled (dormant release gate)', () => {
  const KEY = 'NEXT_PUBLIC_EVIDENCE_UI_ENABLED'
  const original = process.env[KEY]

  afterEach(() => {
    if (original === undefined) delete process.env[KEY]
    else process.env[KEY] = original
  })

  it('is OFF when unset (the default state)', () => {
    delete process.env[KEY]
    expect(isEvidenceUiEnabled()).toBe(false)
  })

  it('is ON only for the exact literal "true"', () => {
    process.env[KEY] = 'true'
    expect(isEvidenceUiEnabled()).toBe(true)
  })

  it.each(['false', 'TRUE', 'True', '1', 'yes', 'on', ' true ', '', 'undefined'])(
    'fails closed for the invalid/ambiguous value %p',
    (val) => {
      process.env[KEY] = val
      expect(isEvidenceUiEnabled()).toBe(false)
    },
  )
})
