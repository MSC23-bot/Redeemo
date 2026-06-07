import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// SEC-H1 (Gate-PR-2) regression guard.
//
// Secrets/tokens/temp-passwords must NEVER be written to logs (production logs
// can leak → account takeover). Earlier, reset/verify tokens, OTP challenges,
// and a branch-user temp password were `console.info`'d with a misleading
// `[dev]` prefix but no NODE_ENV guard, so they ran in every environment.
//
// This test statically scans the backend source: no `console.*` line may
// interpolate a secret-named variable. It fails if anyone re-introduces one.

const SRC_API = resolve(__dirname, '../../../src/api')

const CONSOLE_RE = /console\.(log|info|warn|error|debug)/
// A secret value interpolated into the log line, e.g. `${token}`, `${tempPassword}`,
// `${challenge}`. Matches the variable NAME inside a template `${ ... }`.
const SECRET_INTERP_RE =
  /\$\{[^}]*\b(token|tempPassword|temporaryPassword|challenge|otp|secret|passwordHash)\b[^}]*\}/i

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collectTsFiles(full, acc)
    else if (full.endsWith('.ts')) acc.push(full)
  }
  return acc
}

describe('SEC-H1: secrets / tokens / temp-passwords are never written to logs', () => {
  it('no console.* in src/api interpolates a secret value', () => {
    const offenders: string[] = []
    for (const file of collectTsFiles(SRC_API)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (CONSOLE_RE.test(line) && SECRET_INTERP_RE.test(line)) {
            offenders.push(`${file.replace(SRC_API, 'src/api')}:${i + 1}: ${line.trim()}`)
          }
        })
    }
    expect(
      offenders,
      `A secret value is interpolated into a log line:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
