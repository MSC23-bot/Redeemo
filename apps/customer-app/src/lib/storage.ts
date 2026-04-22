import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const secureStorage = {
  async get(key: string): Promise<string | null> { return SecureStore.getItemAsync(key) },
  async set(key: string, value: string) { await SecureStore.setItemAsync(key, value) },
  async remove(key: string) { await SecureStore.deleteItemAsync(key) },
}

export const prefsStorage = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  },
  async set<T>(key: string, value: T) { await AsyncStorage.setItem(key, JSON.stringify(value)) },
  async remove(key: string) { await AsyncStorage.removeItem(key) },
}
