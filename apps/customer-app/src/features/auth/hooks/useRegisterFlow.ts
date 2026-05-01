import { useState } from 'react'
import { router } from 'expo-router'
import { authApi } from '@/lib/api/auth'
import { mapError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/design-system/motion/Toast'
import type { RegisterInput } from '@/features/auth/schemas'

// Each field error carries its mapped error code so the screen can render
// special UI for cases like EMAIL_ALREADY_EXISTS (tappable "Sign in" link).
// 'LOCAL' is reserved for client-side validation errors that never hit the API.
export type FieldError = { code: string; message: string }

export function useRegisterFlow() {
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrorsState] = useState<Record<string, FieldError>>({})
  const setTokens = useAuthStore((s) => s.setTokens)
  const toast = useToast()

  function setFieldErrors(errors: Record<string, FieldError>) {
    setFieldErrorsState(errors)
  }

  // Set or clear a single field's error without touching the others. Used by
  // on-blur validation: pass `null` when the field has become valid.
  function setFieldError(field: string, error: FieldError | null) {
    setFieldErrorsState((prev) => {
      if (error === null) {
        if (!prev[field]) return prev
        const next = { ...prev }
        delete next[field]
        return next
      }
      return { ...prev, [field]: error }
    })
  }

  function clearFieldError(field: string) {
    setFieldErrorsState((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  // Returns the field-error map when the API rejects with a field error so
  // the caller can focus the relevant input. Returns null on success or when
  // the error was surfaced as a toast (no field to focus).
  async function submit(input: RegisterInput): Promise<Record<string, FieldError> | null> {
    setSubmitting(true)
    setFieldErrorsState({})
    try {
      const res = await authApi.register(input)
      await setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken })
      router.replace('/(auth)/verify-email')
      return null
    } catch (e) {
      const mapped = mapError(e)
      if (mapped.surface === 'field' && mapped.field) {
        const errors = { [mapped.field]: { code: mapped.code, message: mapped.message } }
        setFieldErrorsState(errors)
        return errors
      }
      toast.show(mapped.message, 'danger')
      return null
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting, fieldErrors, setFieldErrors, setFieldError, clearFieldError }
}
