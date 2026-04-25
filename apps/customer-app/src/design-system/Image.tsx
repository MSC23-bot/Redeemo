import React from 'react'
import { Image as ExpoImage, ImageProps } from 'expo-image'
import { ImageStyle, StyleProp } from 'react-native'
import { radius } from './tokens'

type Props = ImageProps & { width: number; height: number; rounded?: keyof typeof radius }

export function Image({ width, height, rounded, style, ...rest }: Props) {
  const composed: StyleProp<ImageStyle> = [
    { width, height, borderRadius: rounded ? radius[rounded] : 0 },
    style as StyleProp<ImageStyle>,
  ]
  return (
    <ExpoImage
      style={composed}
      contentFit="cover"
      transition={180}
      {...rest}
    />
  )
}
