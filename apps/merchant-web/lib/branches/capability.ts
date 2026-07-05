// D-BM1: THE effective per-branch UI capability (merged spec §5).
//
//   effectiveCanManage = role === 'OWNER'
//     || (role === 'BRANCH_MANAGER' && branchCapability?.canManage === true)
//
// - The OWNER arm never consults the branch block: owner authorization is
//   established by the profile role, so an absent / malformed / explicit-false
//   block can NEVER hide an owner control (version-skew immunity by formula).
// - The BM arm requires the role explicitly, so a forged or erroneous `true`
//   cannot widen STAFF or an unknown/null role (defence-in-depth on top of the
//   server emit using the shared assertCanManageBranch predicate, which denies
//   STAFF by construction).
// - UI hint ONLY: backend authorization remains the real boundary on every
//   request regardless of what renders.
// UI gates must consume THIS, never the raw branch block.
import type { Branch } from '@/lib/api/branch'

export function effectiveCanManage(
  role: string | null | undefined,
  branch: Pick<Branch, 'viewerCapabilities'> | null | undefined,
): boolean {
  if (role === 'OWNER') return true
  return role === 'BRANCH_MANAGER' && branch?.viewerCapabilities?.canManage === true
}
