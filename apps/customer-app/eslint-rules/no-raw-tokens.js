// Forbids raw color hex, raw numeric fontSize/padding/margin values, and barrel lucide imports
// within files under app/ and src/features/*/screens/ and src/screens/.
module.exports = {
  meta: { type: 'problem', schema: [], messages: {
    hexColor: 'Raw hex/rgb color not allowed in screens. Use tokens.color.* via design-system.',
    rawFontSize: 'Raw fontSize not allowed. Use <Text variant="..."> from design-system.',
    rawSpacing: 'Raw padding/margin numeric value not allowed. Use tokens.spacing.*.',
    barrelLucide: 'Import lucide icons individually (e.g. `lucide-react-native/ArrowRight`), not from the barrel.',
    repeatMotion: 'Direct withRepeat usage is forbidden outside src/design-system/motion/. Use a design-system motion primitive.',
  }},
  create(context) {
    const filename = context.getFilename()
    const isScreenFile = /\/app\/|\/src\/screens\/|\/src\/features\/.*\/screens\//.test(filename)
    const isDesignSystem = /\/src\/design-system\//.test(filename)
    const hexRe = /^#[0-9a-fA-F]{3,8}$/
    const rgbRe = /^rgba?\(/i
    const spacingProps = new Set(['padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
      'paddingHorizontal', 'paddingVertical', 'margin', 'marginTop', 'marginBottom', 'marginLeft',
      'marginRight', 'marginHorizontal', 'marginVertical', 'gap'])
    return {
      Literal(node) {
        if (!isScreenFile || isDesignSystem) return
        if (typeof node.value === 'string' && (hexRe.test(node.value) || rgbRe.test(node.value))) {
          context.report({ node, messageId: 'hexColor' })
        }
      },
      Property(node) {
        if (!isScreenFile || isDesignSystem) return
        const key = node.key && (node.key.name || node.key.value)
        if (key === 'fontSize' && node.value.type === 'Literal' && typeof node.value.value === 'number') {
          context.report({ node, messageId: 'rawFontSize' })
        }
        if (spacingProps.has(key) && node.value.type === 'Literal' && typeof node.value.value === 'number') {
          context.report({ node, messageId: 'rawSpacing' })
        }
      },
      ImportDeclaration(node) {
        if (node.source.value === 'lucide-react-native' && node.specifiers.some(s => s.type === 'ImportSpecifier')) {
          context.report({ node, messageId: 'barrelLucide' })
        }
      },
      ImportSpecifier(node) {
        const src = node.parent?.source?.value
        if (src === 'react-native-reanimated' && node.imported?.name === 'withRepeat' && !isDesignSystem) {
          context.report({ node, messageId: 'repeatMotion' })
        }
      },
    }
  },
}
