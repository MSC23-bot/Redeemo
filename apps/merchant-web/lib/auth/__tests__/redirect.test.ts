import { safeNext } from '@/lib/auth/redirect'

describe('safeNext (M1 Slice 2 open-redirect guard)', () => {
  it('keeps same-origin relative paths', () => {
    expect(safeNext('/foundations')).toBe('/foundations')
    expect(safeNext('/a/b?c=d')).toBe('/a/b?c=d')
    expect(safeNext('/')).toBe('/')
  })

  it('rejects open-redirect attempts and falls back to /', () => {
    expect(safeNext('//evil.com')).toBe('/')
    expect(safeNext('https://evil.com')).toBe('/')
    expect(safeNext('http://evil.com')).toBe('/')
    expect(safeNext('/\\evil.com')).toBe('/')
    expect(safeNext('/path\\x')).toBe('/')
    expect(safeNext('javascript:alert(1)')).toBe('/')
    expect(safeNext('evil.com')).toBe('/')
    expect(safeNext('/a\nb')).toBe('/')
    expect(safeNext(null)).toBe('/')
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext('')).toBe('/')
  })
})
