import { RuleTester } from 'eslint'
import rule from '../../eslint-rules/no-raw-tokens'

const tester = new RuleTester({ languageOptions: { parser: require('@typescript-eslint/parser'), parserOptions: { ecmaFeatures: { jsx: true } } } })

tester.run('no-raw-tokens', rule as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
  valid: [
    { filename: '/x/app/welcome.tsx', code: "const s = { padding: spacing[4] }" },
    { filename: '/x/src/design-system/motion/PressableScale.tsx', code: "const c = '#E20C04'" },
  ],
  invalid: [
    { filename: '/x/app/welcome.tsx', code: "const c = '#E20C04'", errors: [{ messageId: 'hexColor' }] },
    { filename: '/x/app/welcome.tsx', code: "const s = { fontSize: 14 }", errors: [{ messageId: 'rawFontSize' }] },
    { filename: '/x/app/welcome.tsx', code: "const s = { padding: 16 }", errors: [{ messageId: 'rawSpacing' }] },
    { filename: '/x/app/welcome.tsx', code: "import { withRepeat } from 'react-native-reanimated'", errors: [{ messageId: 'repeatMotion' }] },
  ],
})
