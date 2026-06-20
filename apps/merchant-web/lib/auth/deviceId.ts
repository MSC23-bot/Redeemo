// M1 Slice 1: a stable per-browser device id. The backend deviceSchema requires a
// uuid deviceId + deviceType ('web'); the merchant OTP flow keys "known devices"
// off it, so it must persist across reloads. Stored in localStorage (NOT a cookie;
// it is not a credential, just a stable identifier). Browser-only.
const DEVICE_ID_KEY = 'redeemo_merchant_device_id'

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') {
    // SSR guard: callers only invoke this in client handlers, but stay safe.
    return crypto.randomUUID()
  }
  let id = window.localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}
