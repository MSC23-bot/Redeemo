import React, { useState } from 'react'
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, TextInput, ScrollView
} from 'react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useDeleteAccount } from '../hooks/useDeleteAccount'

interface Props {
  visible:   boolean
  onDismiss: () => void
}

const CONSEQUENCES = [
  'Your account will be permanently anonymised',
  'Your subscription will be cancelled immediately',
  'Your saved favourites and redemption history will be removed',
  'You will be signed out on all devices',
]

const GDPR_NOTE =
  'Your redemption history is retained in anonymised form for fraud prevention. All personal data is deleted in line with our Privacy Policy and UK GDPR.'

function OtpInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [value, setValue] = useState('')
  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6)
    setValue(digits)
    if (digits.length === 6) onComplete(digits)
  }
  return (
    <TextInput
      style={styles.otpInput}
      value={value}
      onChangeText={handleChange}
      keyboardType="number-pad"
      maxLength={6}
      placeholder="• • • • • •"
      placeholderTextColor="#9CA3AF"
      textAlign="center"
      autoFocus
    />
  )
}

export function DeleteAccountFlow({ visible, onDismiss }: Props) {
  const { stage, setStage, error, loading, sendOtp, verifyOtp, confirmDelete, actionToken } =
    useDeleteAccount()

  const handleOtpComplete = async (code: string) => {
    await verifyOtp(code)
    if (actionToken) await confirmDelete()
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Delete account">
      <ScrollView style={styles.content}>
        {stage === 'warning' && (
          <>
            <Text style={styles.title}>Delete account?</Text>

            <View style={styles.warningCard}>
              {CONSEQUENCES.map(line => (
                <View key={line} style={styles.consequenceLine}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.consequenceText}>{line}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.gdprNote}>{GDPR_NOTE}</Text>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={() => { void sendOtp() }}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send verification code</Text>}
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={onDismiss}>
              <Text style={styles.secondaryButtonText}>Keep my account</Text>
            </Pressable>
          </>
        )}

        {stage === 'otp' && (
          <>
            <Text style={styles.stepLabel}>Step 2 of 2</Text>
            <Text style={styles.title}>Enter verification code</Text>
            <Text style={styles.otpSubtitle}>We sent a 6-digit code to your phone. Enter it below to confirm deletion.</Text>

            <OtpInput onComplete={(code) => { void handleOtpComplete(code) }} />

            {error && <Text style={styles.errorText}>{error}</Text>}

            {loading && <ActivityIndicator style={{ marginTop: 16 }} color="#E20C04" />}

            <Pressable onPress={() => setStage('warning')} style={styles.startOver}>
              <Text style={styles.startOverText}>← Start over</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:          { padding: 20 },
  stepLabel:        { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.4)', marginBottom: 4 },
  title:            { fontSize: 20, fontWeight: '700', color: '#010C35', marginBottom: 16 },
  warningCard:      { backgroundColor: 'rgba(226,12,4,0.08)', borderRadius: 12, padding: 16, marginBottom: 12 },
  consequenceLine:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  bulletDot:        { color: '#DC2626', fontWeight: '700', marginTop: 1 },
  consequenceText:  { flex: 1, fontSize: 14, color: '#374151', lineHeight: 22 },
  gdprNote:         { fontSize: 12, color: 'rgba(1,12,53,0.45)', lineHeight: 18, marginBottom: 20 },
  errorText:        { fontSize: 13, color: '#DC2626', marginBottom: 12 },
  primaryButton:    { backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  buttonDisabled:   { opacity: 0.6 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButton:  { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#374151', fontSize: 16, fontWeight: '500' },
  otpSubtitle:      { fontSize: 14, color: 'rgba(1,12,53,0.5)', marginBottom: 24, lineHeight: 22 },
  otpInput:         { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 18, fontSize: 28, letterSpacing: 8, color: '#010C35', fontWeight: '700' },
  startOver:        { alignSelf: 'center', marginTop: 20 },
  startOverText:    { fontSize: 14, color: 'rgba(1,12,53,0.5)', fontWeight: '500' },
})
