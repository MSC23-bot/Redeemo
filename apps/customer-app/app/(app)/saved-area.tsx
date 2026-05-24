import React from 'react'
import { SavedAreaScreen } from '@/features/saved-area/screens/SavedAreaScreen'

/**
 * Saved Area sub-screen — `/saved-area`.
 *
 * Reachable from (a) the Home honesty hint when Discovery resolves
 * against the user's saved profile postcode, and (b) the Profile tab
 * cross-link row. Lets the user view + update their saved postcode
 * via the established PC2 lookup pattern, OR opt into live GPS via
 * the consolidated `useUserLocation` permission flow.
 *
 * Flat sub-route (no settings stack) per audit Task 0b.
 */
export default function SavedAreaRoute() {
  return <SavedAreaScreen />
}
