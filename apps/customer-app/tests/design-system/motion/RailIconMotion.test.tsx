import React from 'react'
import { Text } from 'react-native'
import { render } from '@testing-library/react-native'
import { RailIconMotion, type RailIconKind } from '@/design-system/motion/RailIconMotion'

const KINDS: RailIconKind[] = [
  'food', 'beauty', 'fitness', 'medical', 'outabout', 'shopping',
  'homeservices', 'travel', 'family', 'auto', 'pets', 'featured', 'default',
]

describe('<RailIconMotion> (per-icon looping Home rail signatures)', () => {
  it('renders its child glyph and exposes the testID', () => {
    const { getByTestId, getByText } = render(
      <RailIconMotion kind="food" testID="mark"><Text>glyph</Text></RailIconMotion>,
    )
    expect(getByTestId('mark')).toBeTruthy()
    expect(getByText('glyph')).toBeTruthy()
  })

  it('renders every logical kind without crashing', () => {
    for (const kind of KINDS) {
      const { getByTestId, unmount } = render(
        <RailIconMotion kind={kind} testID={`m-${kind}`}><Text>{kind}</Text></RailIconMotion>,
      )
      expect(getByTestId(`m-${kind}`)).toBeTruthy()
      unmount()
    }
  })
})
