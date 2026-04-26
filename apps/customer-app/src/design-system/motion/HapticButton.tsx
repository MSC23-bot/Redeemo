import React from 'react'
import { PressableScale } from './PressableScale'
import { PressableProps } from 'react-native'
import { haptics } from '../haptics'

type Props = Omit<PressableProps, 'onPress'> & {
  children: React.ReactNode
  onPress: () => Promise<unknown> | void
}

export function HapticButton({ children, onPress, ...rest }: Props) {
  return (
    <PressableScale
      hapticStyle="medium"
      onPress={async () => {
        try { await onPress(); await haptics.success() }
        catch (e) { await haptics.error(); throw e }
      }}
      {...rest}
    >
      {children}
    </PressableScale>
  )
}
