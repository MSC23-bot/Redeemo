// Extends `expect` with DOM matchers (toBeInTheDocument, toHaveTextContent, ...).
import '@testing-library/jest-dom'

// jsdom's crypto lacks randomUUID (used by lib/auth/deviceId). Back it with Node's
// webcrypto in the test env (real browsers + the Node route-handler env already have
// it). webcrypto is a superset (getRandomValues + randomUUID + subtle), so this is safe.
import { webcrypto } from 'node:crypto'
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true })
}

// jsdom implements neither URL.createObjectURL nor URL.revokeObjectURL (object
// URLs need a real browser). Components that preview picked/cropped image files
// (FileUpload's post-upload thumbnail, ImageCropModal's source URL) call them.
// Plain functions (not jest.fn) so `clearMocks` cannot strip the implementation.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => `blob:jsdom-${Math.random().toString(36).slice(2)}`
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {}
}
