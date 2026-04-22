jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}))
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { secureStorage, prefsStorage } from '@/lib/storage'

describe('storage', () => {
  it('secureStorage round-trips tokens', async () => {
    await secureStorage.set('accessToken', 'abc')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('accessToken', 'abc')
  })
  it('prefsStorage JSON-serialises values', async () => {
    await prefsStorage.set('onboarding-state', { x: 1 })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('onboarding-state', JSON.stringify({ x: 1 }))
  })
})
