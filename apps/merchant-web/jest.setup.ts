// Extends `expect` with DOM matchers (toBeInTheDocument, toHaveTextContent, ...).
import '@testing-library/jest-dom'

// jsdom's crypto lacks randomUUID (used by lib/auth/deviceId). Back it with Node's
// webcrypto in the test env (real browsers + the Node route-handler env already have
// it). webcrypto is a superset (getRandomValues + randomUUID + subtle), so this is safe.
import { webcrypto } from 'node:crypto'
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true })
}
