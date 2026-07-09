import {
  PORTAL_CAP,
  APP_CAP,
  SEARCH_THRESHOLD,
  ROLE_LABEL,
  ROLE_DETAIL,
  branchCoverageLabel,
  memberStatusLabel,
  lastSeenLabel,
} from '../display'

describe('staff display constants', () => {
  it('hardcodes the prototype caps + search threshold', () => {
    expect(PORTAL_CAP).toBe(8)
    expect(APP_CAP).toBe(20)
    expect(SEARCH_THRESHOLD).toBe(4)
  })

  it('has human role labels (no em-dashes)', () => {
    expect(ROLE_LABEL.OWNER).toBe('Owner')
    expect(ROLE_LABEL.BRANCH_MANAGER).toBe('Branch manager')
    expect(ROLE_LABEL.STAFF).toBe('Staff')
    const all = Object.values(ROLE_LABEL).join(' ')
    expect(all).not.toMatch(/[—–]/)
  })

  it('ROLE_DETAIL carries can/cannot copy for every role with no em-dashes', () => {
    for (const role of ['OWNER', 'BRANCH_MANAGER', 'STAFF'] as const) {
      expect(ROLE_DETAIL[role].can.length).toBeGreaterThan(0)
      expect(ROLE_DETAIL[role].cannot.length).toBeGreaterThan(0)
      const text = [...ROLE_DETAIL[role].can, ...ROLE_DETAIL[role].cannot].join(' ')
      expect(text).not.toMatch(/[—–]/)
    }
  })

  // WF9 (staging acceptance walk): the invite dialog told owners a Branch manager
  // "Cannot edit business details, branches, or branch PINs" - wrong about
  // branches + PINs. The shipped boundary (getBranchPin: OWNER or ASSIGNED
  // BRANCH_MANAGER) grants an assigned BM branch edits + PIN reveal/change/send
  // for their OWN branches. Copy must say so, and must not claim they cannot.
  it('ROLE_DETAIL for BRANCH_MANAGER states the real branch/PIN capability, not a blanket denial', () => {
    const detail = ROLE_DETAIL.BRANCH_MANAGER
    expect(detail.can.some((line) => /assigned branch/i.test(line) && /branch pin/i.test(line))).toBe(true)
    const cannotText = detail.cannot.join(' ')
    expect(cannotText).not.toMatch(/branches, or branch pins/i)
    expect(cannotText).toMatch(/business details/i)
  })
})

describe('branchCoverageLabel', () => {
  const nameById = (id: string) => ({ b1: 'High Street', b2: 'Riverside' })[id as 'b1' | 'b2']

  it('returns All branches when allBranches', () => {
    expect(branchCoverageLabel(true, [], nameById)).toBe('All branches')
  })
  it('returns the branch name for a single scoped branch', () => {
    expect(branchCoverageLabel(false, ['b1'], nameById)).toBe('High Street')
  })
  it('returns N branches for multiple scoped branches', () => {
    expect(branchCoverageLabel(false, ['b1', 'b2'], nameById)).toBe('2 branches')
  })
  it('returns No branches when scoped to none', () => {
    expect(branchCoverageLabel(false, [], nameById)).toBe('No branches')
  })
})

describe('memberStatusLabel', () => {
  it('reads Deactivated for INACTIVE', () => {
    expect(memberStatusLabel('INACTIVE', true)).toBe('Deactivated')
  })
  it('reads Invite pending for a not-yet-claimed active member', () => {
    expect(memberStatusLabel('ACTIVE', false)).toBe('Invite pending')
  })
  it('reads Active for a claimed active member', () => {
    expect(memberStatusLabel('ACTIVE', true)).toBe('Active')
  })
})

describe('lastSeenLabel', () => {
  it('returns a not-signed-in prefix with no value when never logged in', () => {
    expect(lastSeenLabel(null)).toEqual({ prefix: 'Not signed in yet', value: null })
  })
  it('returns Last seen with the iso when present', () => {
    expect(lastSeenLabel('2026-06-20T10:00:00.000Z')).toEqual({
      prefix: 'Last seen',
      value: '2026-06-20T10:00:00.000Z',
    })
  })
})
