'use client'

// Day-2 Vouchers B3 (spec §0 / §6: owner-only management in v1). A SINGLE
// capability seam for voucher management. v1 returns canManage:true for every
// authenticated merchant session (there is no branch-manager / staff role model
// yet - that is the deferred Staff & access milestone). When that role model
// lands, this hook becomes the one place to branch on it; every voucher surface
// already routes its can-edit / can-create gating through here, so no caller
// changes are needed beyond this file.

export interface VoucherCapability {
  /** Can create / edit / submit / delete / duplicate custom vouchers. */
  canManage: boolean
}

export function useVoucherCapability(): VoucherCapability {
  // v1: owner-only by construction (the only merchant session today is the owner).
  // The seam exists so the future role model has exactly one edit point.
  //
  // INVARIANT (B-13): this is a DISPLAY-ONLY gate. Any privileged capability it
  // unlocks (create / edit / submit / delete / duplicate) MUST ALSO be enforced
  // server-side - the client gate only decides what to show, never what is allowed.
  return { canManage: true }
}
