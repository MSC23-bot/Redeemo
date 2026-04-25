import { color, spacing, radius, motion, layer, opacity, layout, typography } from '@/design-system/tokens'

describe('tokens', () => {
  it('exposes brand colors matching the website', () => {
    expect(color.navy).toBe('#010C35')
    expect(color.brandRose).toBe('#E20C04')
    expect(color.brandCoral).toBe('#E84A00')
    expect(color.brandGradient).toEqual(['#E20C04', '#E84A00'])
  })
  it('uses warm greys (not cool slate) for text.secondary/tertiary', () => {
    expect(color.text.secondary).toBe('#4B5563')
    expect(color.text.tertiary).toBe('#9CA3AF')
  })
  it('has 4pt spacing scale', () => {
    expect(spacing[0]).toBe(0); expect(spacing[1]).toBe(4); expect(spacing[4]).toBe(16); expect(spacing[10]).toBe(64)
  })
  it('has motion durations and easings', () => {
    expect(motion.duration.base).toBe(240)
    expect(motion.easing.standard).toEqual([0.4, 0, 0.2, 1])
    expect(motion.spring.gentle).toEqual({ damping: 20, stiffness: 180 })
  })
  it('typography.body.md is the body default', () => {
    expect(typography['body.md'].fontSize).toBe(16)
    expect(typography['body.md'].lineHeight).toBe(24)
  })
  it('layer tokens are ordered for stacking', () => {
    expect(layer.tabBar).toBeLessThan(layer.sheet)
    expect(layer.sheet).toBeLessThan(layer.toast)
  })
})
