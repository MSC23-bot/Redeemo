import React, { useState } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Platform, ActivityIndicator
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Lock } from 'lucide-react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import type { Profile } from '@/lib/api/profile'

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say', 'Other'] as const

interface Props {
  visible:    boolean
  onDismiss:  () => void
  profile:    Profile
  onGetHelp:  (topic: string, message: string) => void
}

export function PersonalInfoSheet({ visible, onDismiss, profile, onGetHelp }: Props) {
  const [firstName, setFirstName] = useState(profile.firstName ?? '')
  const [dob, setDob]             = useState<Date | null>(
    profile.dateOfBirth ? new Date(profile.dateOfBirth) : null
  )
  const [gender, setGender]       = useState(profile.gender ?? '')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const { mutate, isPending }     = useUpdateProfile()

  const handleSave = () => {
    if (!firstName.trim()) { setError('First name is required'); return }
    setError(null)
    const patch: { name: string; dateOfBirth?: string; gender?: string } = {
      name: firstName.trim(),
    }
    if (dob) patch.dateOfBirth = dob.toISOString()
    if (gender) patch.gender = gender
    mutate(
      patch,
      { onSuccess: () => onDismiss(), onError: () => setError('Failed to save. Please try again.') }
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Personal information">
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Personal info</Text>

        {/* First name */}
        <Text style={styles.fieldLabel}>First name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          returnKeyType="next"
        />

        {/* Last name — read-only */}
        <Text style={styles.fieldLabel}>Last name</Text>
        <View style={[styles.input, styles.readOnly]}>
          <Text style={styles.readOnlyText}>{profile.lastName ?? '—'}</Text>
          <Lock size={14} color="#9CA3AF" />
        </View>

        {/* Date of birth */}
        <Text style={styles.fieldLabel}>Date of birth</Text>
        <Pressable style={styles.input} onPress={() => setShowDatePicker(true)}>
          <Text style={dob ? styles.inputText : styles.placeholder}>
            {dob ? dob.toLocaleDateString('en-GB') : 'Select date'}
          </Text>
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={dob ?? new Date(2000, 0, 1)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={(_, date) => { setShowDatePicker(false); if (date) setDob(date) }}
          />
        )}

        {/* Gender */}
        <Text style={styles.fieldLabel}>Gender</Text>
        <View style={styles.genderRow}>
          {GENDER_OPTIONS.map(opt => (
            <Pressable
              key={opt}
              style={[styles.genderChip, gender === opt && styles.genderChipSelected]}
              onPress={() => setGender(opt === gender ? '' : opt)}
            >
              <Text style={[styles.genderChipText, gender === opt && styles.genderChipTextSelected]}>
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Email — read-only */}
        <Text style={styles.fieldLabel}>Email address</Text>
        <View style={[styles.input, styles.readOnly]}>
          <Text style={styles.readOnlyText} numberOfLines={1}>{profile.email}</Text>
          <Lock size={14} color="#9CA3AF" />
        </View>

        {/* Phone — read-only */}
        <Text style={styles.fieldLabel}>Phone number</Text>
        <View style={[styles.input, styles.readOnly]}>
          <Text style={styles.readOnlyText}>{profile.phone ?? 'Not added'}</Text>
          <Lock size={14} color="#9CA3AF" />
        </View>

        <Text style={styles.lockNote}>
          For security, email and phone can only be changed by our team. Tap below to request a change.
        </Text>
        <Pressable onPress={() => onGetHelp('Account issue', "I'd like to change my contact details.")}>
          <Text style={styles.helpLink}>Get help with this →</Text>
        </Pressable>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, isPending && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isPending}
        >
          {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save changes</Text>}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:          { padding: 20, maxHeight: '90%' },
  title:            { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 20 },
  fieldLabel:       { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.5)', marginBottom: 4, marginTop: 12 },
  input:            { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputText:        { fontSize: 15, color: '#010C35' },
  placeholder:      { fontSize: 15, color: '#9CA3AF' },
  readOnly:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F9FAFB' },
  readOnlyText:     { fontSize: 15, color: '#6B7280', flex: 1 },
  genderRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genderChip:       { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  genderChipSelected: { backgroundColor: '#010C35', borderColor: '#010C35' },
  genderChipText:   { fontSize: 13, color: '#374151' },
  genderChipTextSelected: { color: '#FFFFFF' },
  divider:          { height: 1, backgroundColor: '#F3F4F6', marginVertical: 16 },
  lockNote:         { fontSize: 12, color: 'rgba(1,12,53,0.5)', marginTop: 8, lineHeight: 18 },
  helpLink:         { fontSize: 13, color: '#E20C04', fontWeight: '500', marginTop: 6 },
  errorText:        { fontSize: 13, color: '#DC2626', marginTop: 12 },
  saveButton:       { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
