import { describe, it, expect } from 'vitest'
import { rehearsalPrefix, assertInsideRehearsalPrefix } from '../../prisma/r2-rehearsal.lib'

const UUID = '12345678-1234-1234-1234-123456789abc'

describe('rehearsalPrefix', () => {
  it('builds the canonical disposable prefix under document/', () => {
    expect(rehearsalPrefix(UUID)).toBe(`document/rehearsal-r2-${UUID}/`)
  })
  it.each([['not-a-uuid'], [''], ['12345678-1234-1234-1234-123456789ABC'], ['../evil'], ['12345678123412341234123456789abc']])(
    'rejects malformed uuid %p',
    (u) => {
      expect(() => rehearsalPrefix(u)).toThrow()
    },
  )
})

describe('assertInsideRehearsalPrefix (fail-closed key guard)', () => {
  it('accepts a plain leaf inside the prefix', () => {
    expect(() => assertInsideRehearsalPrefix(`document/rehearsal-r2-${UUID}/probe.pdf`, UUID)).not.toThrow()
  })
  it.each([
    ['document/other-merchant/file.pdf'],
    [`document/rehearsal-r2-${UUID}/../escape.pdf`],
    [`document/rehearsal-r2-${UUID}/nested/deeper.pdf`],
    ['logo/anything.png'],
    [`document/rehearsal-r2-${UUID}`],
  ])('rejects out-of-prefix or nested key %p', (k) => {
    expect(() => assertInsideRehearsalPrefix(k, UUID)).toThrow()
  })
})
