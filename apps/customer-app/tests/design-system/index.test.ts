import * as DS from '@/design-system'

describe('design-system entry', () => {
  it('exports expected surface', () => {
    expect(typeof DS.Button).toBe('function')
    expect(typeof DS.TextField).toBe('function')
    expect(typeof DS.useMotionScale).toBe('function')
    expect(DS.color.navy).toBe('#010C35')
  })
})
