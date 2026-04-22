import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useUpdateInterests } from '@/hooks/useUpdateInterests'
import { useInterestsCatalogue } from '@/hooks/useInterestsCatalogue'

interface Props {
  visible:        boolean
  onDismiss:      () => void
  selectedIds:    string[]
}

export function InterestsSheet({ visible, onDismiss, selectedIds }: Props) {
  const { data } = useInterestsCatalogue()
  const available = data?.interests ?? []
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds))
  const [error, setError]       = useState<string | null>(null)
  const { mutate, isPending }   = useUpdateInterests()

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSave = () => {
    setError(null)
    mutate(
      Array.from(selected),
      { onSuccess: onDismiss, onError: () => setError('Failed to save. Please try again.') }
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Interests">
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Interests</Text>
        <Text style={styles.subtitle}>Choose topics you enjoy to improve your recommendations.</Text>

        <View style={styles.chipGrid}>
          {available.map(interest => {
            const isSelected = selected.has(interest.id)
            return (
              <Pressable
                key={interest.id}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => toggle(interest.id)}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                  {interest.name}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, isPending && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isPending}
        >
          {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save interests</Text>}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:           { padding: 20 },
  title:             { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 6 },
  subtitle:          { fontSize: 13, color: 'rgba(1,12,53,0.5)', marginBottom: 16, lineHeight: 20 },
  chipGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip:              { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipSelected:      { backgroundColor: '#010C35', borderColor: '#010C35' },
  chipText:          { fontSize: 14, color: '#374151' },
  chipTextSelected:  { color: '#FFFFFF' },
  errorText:         { fontSize: 13, color: '#DC2626', marginBottom: 8 },
  saveButton:        { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:    { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
