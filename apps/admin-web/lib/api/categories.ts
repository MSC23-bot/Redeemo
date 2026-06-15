/**
 * Admin categories API (Option B B2.3).
 *
 * Typed wrapper for the categories an admin can assign as a merchant's
 * primaryCategoryId:
 *
 *   GET /api/v1/admin/categories  (gated `merchant:read`)
 *     -> { categories: [{ id, name, parentId, eligible }] }
 *        `eligible` is true when the category has >= 2 active RMV templates.
 *        Ineligible categories are returned too (so the picker can show-but-
 *        disable them); assigning one would 400 with NO_RMV_TEMPLATE.
 *
 * The response is Zod-validated so contract drift surfaces as a clear error.
 */
import { z } from 'zod'
import { apiFetch } from './client'

export const adminCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  eligible: z.boolean(),
})
export type AdminCategory = z.infer<typeof adminCategorySchema>

export const adminCategoriesResponseSchema = z.object({
  categories: z.array(adminCategorySchema),
})
export type AdminCategoriesResponse = z.infer<typeof adminCategoriesResponseSchema>

export const adminCategoriesApi = {
  list: async (): Promise<AdminCategoriesResponse> => {
    const raw = await apiFetch<unknown>('/api/v1/admin/categories', { auth: true })
    return adminCategoriesResponseSchema.parse(raw)
  },
}
