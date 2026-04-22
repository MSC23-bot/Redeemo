import React, { useState } from 'react'
import { Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useMerchantRequest } from '../hooks/useMerchantRequest'

interface Props {
  visible:   boolean
  onDismiss: () => void
  onSuccess: () => void
}

export function RequestMerchantSheet({ visible, onDismiss, onSuccess }: Props) {
  const [businessName, setBusinessName] = useState('')
  const [location, setLocation]         = useState('')
  const [note, setNote]                 = useState('')
  const [error, setError]               = useState<string | null>(null)
  const { mutate, isPending }           = useMerchantRequest()

  const handleSubmit = () => {
    if (!businessName.trim()) { setError('Business name is required'); return }
    if (!location.trim())     { setError('City / location is required'); return }
    setError(null)
    const trimmedNote = note.trim()
    mutate(
      {
        businessName: businessName.trim(),
        location: location.trim(),
        ...(trimmedNote ? { note: trimmedNote } : {}),
      },
      {
        onSuccess: () => { onSuccess(); onDismiss() },
        onError:   () => setError('Failed to submit. Please try again.'),
      }
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Request a merchant">
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Request a merchant</Text>
        <Text style={styles.subtitle}>Know a great local business that should be on Redeemo? Let us know.</Text>

        <Text style={styles.fieldLabel}>Business name *</Text>
        <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} maxLength={100} />

        <Text style={styles.fieldLabel}>City / location *</Text>
        <TextInput style={styles.input} value={location} onChangeText={setLocation} maxLength={100} />

        <Text style={styles.fieldLabel}>Anything specific to share? (optional)</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          placeholder="Anything specific to share about this place?"
          placeholderTextColor="#9CA3AF"
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.submitButton, isPending && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isPending}
        >
          {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit request</Text>}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:        { padding: 20 },
  title:          { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 6 },
  subtitle:       { fontSize: 13, color: 'rgba(1,12,53,0.5)', marginBottom: 16, lineHeight: 20 },
  fieldLabel:     { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.5)', marginBottom: 4, marginTop: 12 },
  input:          { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  noteInput:      { minHeight: 100, textAlignVertical: 'top' },
  errorText:      { fontSize: 13, color: '#DC2626', marginTop: 12 },
  submitButton:   { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  buttonDisabled: { opacity: 0.6 },
  submitText:     { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
