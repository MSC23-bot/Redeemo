import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

// CI runner for the committed shell test suite (Codex round-4 finding 5). Runs the NON-DB portion
// (wrapper refusals, xtrace fail-closed, clean stdout, encoding) in CI under bash, and under zsh
// when available (macOS/dev always; some CI images lack zsh: skipped there, with the local
// full-matrix evidence recorded in the PR). The --with-db manifest matrix needs a local disposable
// PostgreSQL and is run locally (documented in the runbook); CI stays DB-free by design.
const script = path.resolve(__dirname, 'rehearsal-context.test.sh')

function run(shell: string, args: string[] = []): string {
  return execFileSync(shell, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

describe('rehearsal-context wrapper shell suite', () => {
  it('passes under bash (non-DB portion)', () => {
    const out = run('bash')
    expect(out).toMatch(/# bash: \d+ passed, 0 failed/)
  })

  const zsh = ['/bin/zsh', '/usr/bin/zsh'].find((p) => existsSync(p))
  it.runIf(!!zsh)('passes under zsh (non-DB portion)', () => {
    const out = run(zsh!)
    expect(out).toMatch(/# zsh[\d.]*: \d+ passed, 0 failed/)
  })
})
