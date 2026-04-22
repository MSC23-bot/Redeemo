import React, { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { Eye, EyeOff } from 'lucide-react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { api } from '@/lib/api'

interface Props {
  visible:   boolean
  onDismiss: () => void
  onSuccess: () => void
}

export function ChangePasswordSheet({ visible, onDismiss, onSuccess }: Props) {
  const [current, setCurrent]   = useState('')
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  const handleSave = async () => {
    if (!current || !next || !confirm) { setError('All fields are required'); return }
    if (next.length < 8)              { setError('New password must be at least 8 characters'); return }
    if (next === current)             { setError('New password must be different from your current password'); return }
    if (next !== confirm)             { setError('Passwords do not match'); return }

    setError(null)
    setLoading(true)
    try {
      await api.post<unknown>('/api/v1/customer/profile/change-password', { currentPassword: current, newPassword: next })
      onSuccess()
      onDismiss()
    } catch (e: unknown) {
      setError(
        (e as { code?: string })?.code === 'CURRENT_PASSWORD_INCORRECT'
          ? 'Your current password is incorrect.'
          : 'Failed to change password. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Change password">
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Change password</Text>

        <View>
          <Text style={styles.fieldLabel}>Current password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={current}
              onChangeText={setCurrent}
              secureTextEntry={!showCurrent}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowCurrent(v => !v)} style={styles.eyeButton}>
              {showCurrent ? <EyeOff size={18} color="#9CA3AF" /> : <Eye size={18} color="#9CA3AF" />}
            </Pressable>
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>New password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={next}
              onChangeText={setNext}
              secureTextEntry={!showNext}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowNext(v => !v)} style={styles.eyeButton}>
              {showNext ? <EyeOff size={18} color="#9CA3AF" /> : <Eye size={18} color="#9CA3AF" />}
            </Pressable>
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>Confirm new password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowConfirm(v => !v)} style={styles.eyeButton}>
              {showConfirm ? <EyeOff size={18} color="#9CA3AF" /> : <Eye size={18} color="#9CA3AF" />}
            </Pressable>
          </View>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Change password</Text>}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:          { padding: 20 },
  title:            { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 20 },
  fieldLabel:       { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.5)', marginBottom: 4, marginTop: 12 },
  passwordRow:      { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10 },
  passwordInput:    { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  eyeButton:        { padding: 12 },
  errorText:        { fontSize: 13, color: '#DC2626', marginTop: 12 },
  saveButton:       { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
