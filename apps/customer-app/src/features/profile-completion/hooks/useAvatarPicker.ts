import { useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'

// 400px JPEG at 0.72 is typically 30–80 KB; 500 KB is a generous safety net
const MAX_BYTES = 500_000

export function useAvatarPicker() {
  const [uri, setUri]       = useState<string | null>(null)
  const [base64, setBase64] = useState<string | null>(null)
  const [error, setError]   = useState<string | null>(null)

  async function _processAsset(asset: ImagePicker.ImagePickerAsset) {
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 400 } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    )
    const finalBase64 = manipulated.base64 ?? asset.base64 ?? ''
    const sizeBytes = Math.ceil((finalBase64.length * 3) / 4)
    if (sizeBytes >= MAX_BYTES) {
      setError('Image is still too large after resizing. Please try a different photo.')
      return
    }
    setBase64(finalBase64)
    setUri(manipulated.uri)
  }

  async function pick() {
    setError(null)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      setError('Gallery access denied. Please allow it in Settings.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:    ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect:        [1, 1],
      quality:       0.9,
    })
    if (result.canceled || !result.assets?.[0]) return
    await _processAsset(result.assets[0]!)
  }

  async function capture() {
    setError(null)
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      setError('Camera access denied. Please allow it in Settings.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes:    ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect:        [1, 1],
      quality:       0.9,
    })
    if (result.canceled || !result.assets?.[0]) return
    await _processAsset(result.assets[0]!)
  }

  const dataUrl = base64 ? `data:image/jpeg;base64,${base64}` : null

  return { uri, dataUrl, base64, error, pick, capture }
}
