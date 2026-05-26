import React, { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import type { Profile } from '@/lib/api/profile'

interface Props {
  visible:   boolean
  onDismiss: () => void
  profile:   Profile
}

export function AddressSheet({ visible, onDismiss, profile }: Props) {
  const [line1, setLine1]     = useState(profile.addressLine1 ?? '')
  const [line2, setLine2]     = useState(profile.addressLine2 ?? '')
  const [city, setCity]       = useState(profile.city ?? '')
  const [postcode, setPostcode] = useState(profile.postcode ?? '')
  const [error, setError]     = useState<string | null>(null)
  const { mutate, isPending } = useUpdateProfile()

  const handleSave = () => {
    if (!line1.trim() || !city.trim() || !postcode.trim()) {
      setError('Address line 1, city, and postcode are required')
      return
    }
    setError(null)
    const trimmedLine2 = line2.trim()
    const patch: Parameters<typeof mutate>[0] = {
      addressLine1: line1.trim(),
      city: city.trim(),
      postcode: postcode.trim(),
    }
    if (trimmedLine2) patch.addressLine2 = trimmedLine2
    mutate(
      patch,
      { onSuccess: onDismiss, onError: () => setError('Failed to save. Please try again.') }
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Address">
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Address</Text>

        {[
          { label: 'Address line 1', value: line1, onChange: setLine1, required: true },
          { label: 'Address line 2 (optional)', value: line2, onChange: setLine2, required: false },
          { label: 'City', value: city, onChange: setCity, required: true },
          { label: 'Postcode', value: postcode, onChange: setPostcode, required: true },
        ].map(({ label, value, onChange, required }) => (
          <View key={label}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChange}
              autoCapitalize="words"
              placeholder={required ? undefined : 'Optional'}
              placeholderTextColor="#9CA3AF"
            />
          </View>
        ))}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, isPending && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isPending}
        >
          {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save address</Text>}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:          { padding: 20 },
  title:            { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 20 },
  fieldLabel:       { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.5)', marginBottom: 4, marginTop: 12 },
  input:            { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  errorText:        { fontSize: 13, color: '#DC2626', marginTop: 12 },
  saveButton:       { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
