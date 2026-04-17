import React, { useEffect, useState } from 'react'
import { View, ScrollView, Switch, StyleSheet, TouchableOpacity } from 'react-native'
import { X } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { GradientBrand } from '@/design-system/components/GradientBrand'
import { useCategories } from '@/hooks/useCategories'

export type FilterState = {
  categoryId: string | null
  subcategoryId: string | null
  sortBy: 'relevance' | 'nearest' | 'top_rated' | 'highest_saving'
  voucherTypes: string[]
  maxDistanceMiles: number
  minSaving: number
  amenityIds: string[]
  openNow: boolean
}

type Props = {
  visible: boolean
  filters: FilterState
  resultCount: number
  onApply: (filters: FilterState) => void
  onDismiss: () => void
}

const SORT_OPTIONS: { key: FilterState['sortBy']; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'nearest', label: 'Nearest' },
  { key: 'top_rated', label: 'Top Rated' },
  { key: 'highest_saving', label: 'Highest Saving' },
]

const VOUCHER_TYPES = ['BOGO', 'Discount', 'Freebie', 'Spend & Save', 'Package Deal']

const AMENITIES = [
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'parking', label: 'Parking' },
  { id: 'wheelchair', label: 'Wheelchair Access' },
  { id: 'family', label: 'Family Friendly' },
  { id: 'outdoor', label: 'Outdoor Seating' },
  { id: 'pet', label: 'Pet Friendly' },
]

export function FilterSheet({ visible, filters, resultCount, onApply, onDismiss }: Props) {
  const [local, setLocal] = useState<FilterState>(filters)
  const { data: categoriesData } = useCategories()
  const categories = categoriesData?.categories ?? []

  useEffect(() => {
    setLocal(filters)
  }, [filters])

  function toggleCategory(id: string) {
    setLocal((prev) => ({
      ...prev,
      categoryId: prev.categoryId === id ? null : id,
      subcategoryId: null,
    }))
  }

  function setSortBy(key: FilterState['sortBy']) {
    setLocal((prev) => ({ ...prev, sortBy: key }))
  }

  function toggleVoucherType(type: string) {
    setLocal((prev) => {
      const has = prev.voucherTypes.includes(type)
      return {
        ...prev,
        voucherTypes: has
          ? prev.voucherTypes.filter((t) => t !== type)
          : [...prev.voucherTypes, type],
      }
    })
  }

  function toggleAmenity(id: string) {
    setLocal((prev) => {
      const has = prev.amenityIds.includes(id)
      return {
        ...prev,
        amenityIds: has
          ? prev.amenityIds.filter((a) => a !== id)
          : [...prev.amenityIds, id],
      }
    })
  }

  function handleApply() {
    onApply(local)
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Filter results">
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.scrollView}
      >
        {/* Category section */}
        {categories.length > 0 && (
          <View>
            <Text variant="label.eyebrow" color="secondary" style={styles.sectionLabel}>
              Category
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {categories.map((cat) => {
                const active = local.categoryId === cat.id
                return (
                  <PressableScale key={cat.id} onPress={() => toggleCategory(cat.id)} hapticStyle="light">
                    <View style={[styles.pill, active && styles.pillActive]}>
                      {active && (
                        <X size={12} color={color.onBrand} style={styles.pillIcon} />
                      )}
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>
                        {cat.name}
                      </Text>
                    </View>
                  </PressableScale>
                )
              })}
            </ScrollView>
          </View>
        )}

        {/* Sort by section */}
        <View>
          <Text variant="label.eyebrow" color="secondary" style={styles.sectionLabel}>
            Sort By
          </Text>
          <View style={styles.pillWrap}>
            {SORT_OPTIONS.map((opt) => {
              const active = local.sortBy === opt.key
              return (
                <PressableScale key={opt.key} onPress={() => setSortBy(opt.key)} hapticStyle="light">
                  <View style={[styles.pill, active && styles.pillActive]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {opt.label}
                    </Text>
                  </View>
                </PressableScale>
              )
            })}
          </View>
        </View>

        {/* Voucher type section */}
        <View>
          <Text variant="label.eyebrow" color="secondary" style={styles.sectionLabel}>
            Voucher Type
          </Text>
          <View style={styles.pillWrap}>
            {VOUCHER_TYPES.map((type) => {
              const active = local.voucherTypes.includes(type)
              return (
                <PressableScale key={type} onPress={() => toggleVoucherType(type)} hapticStyle="light">
                  <View style={[styles.pill, active && styles.pillActive]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {type}
                    </Text>
                  </View>
                </PressableScale>
              )
            })}
          </View>
        </View>

        {/* Amenities section */}
        <View>
          <Text variant="label.eyebrow" color="secondary" style={styles.sectionLabel}>
            Amenities
          </Text>
          <View style={styles.pillWrap}>
            {AMENITIES.map((amenity) => {
              const active = local.amenityIds.includes(amenity.id)
              return (
                <PressableScale key={amenity.id} onPress={() => toggleAmenity(amenity.id)} hapticStyle="light">
                  <View style={[styles.pill, active && styles.pillAmenityActive]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {amenity.label}
                    </Text>
                  </View>
                </PressableScale>
              )
            })}
          </View>
        </View>

        {/* Open now section */}
        <View style={styles.openNowRow}>
          <Text variant="body.sm">Open Now</Text>
          <Switch
            value={local.openNow}
            onValueChange={(val) => setLocal((prev) => ({ ...prev, openNow: val }))}
            trackColor={{ true: '#10B981', false: '#D1D5DB' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Open now filter"
          />
        </View>

        {/* Apply button */}
        <TouchableOpacity onPress={handleApply} activeOpacity={0.9} accessibilityLabel={`Show ${resultCount} results`}>
          <GradientBrand style={styles.applyButton}>
            <Text variant="heading.sm" style={styles.applyButtonText}>
              Show {resultCount} results
            </Text>
          </GradientBrand>
        </TouchableOpacity>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  scrollView: {
    maxHeight: 500,
  },
  sectionLabel: {
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingBottom: spacing[1],
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: color.surface.neutral,
  },
  pillActive: {
    backgroundColor: color.brandRose,
  },
  pillAmenityActive: {
    backgroundColor: color.navy,
  },
  pillIcon: {
    marginRight: 4,
  },
  pillText: {
    fontSize: 12,
    fontFamily: 'Lato-SemiBold',
    color: color.navy,
  },
  pillTextActive: {
    color: color.onBrand,
  },
  openNowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  applyButton: {
    borderRadius: radius.md,
    marginTop: spacing[5],
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Lato-Bold',
  },
})
