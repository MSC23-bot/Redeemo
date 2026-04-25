import React from 'react'
import { Text } from 'react-native'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ScreenContainer } from '@/design-system/components/ScreenContainer'

const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, bottom: 34, right: 0 },
}

describe('<ScreenContainer>', () => {
  it('renders children', () => {
    const { getByText } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ScreenContainer><Text>ok</Text></ScreenContainer>
      </SafeAreaProvider>
    )
    expect(getByText('ok')).toBeTruthy()
  })
})
