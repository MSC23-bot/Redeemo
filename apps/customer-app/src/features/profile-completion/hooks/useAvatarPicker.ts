import { useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'

const MAX_BYTES = 150_000

export function useAvatarPicker() {
  const [uri, setUri] = useState<string | null>(null)
  const [base64, setBase64] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading] = useState(false)

  async function pick() {
    setError(null)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      setError('Permission denied')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]!

    // Compress
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 512 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    )

    const finalBase64 = manipulated.base64 ?? asset.base64 ?? ''
    const sizeBytes = Math.ceil((finalBase64.length * 3) / 4)
    if (sizeBytes >= MAX_BYTES) {
      setError('Image is too large. Please choose a smaller image.')
      return
    }

    setBase64(finalBase64)
    setUri(manipulated.uri)
  }

  const dataUrl = base64 ? `data:image/jpeg;base64,${base64}` : null

  return { uri, dataUrl, base64, error, loading, pick }
}
