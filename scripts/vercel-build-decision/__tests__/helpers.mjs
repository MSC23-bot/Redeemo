// Test helpers: build throwaway git repositories under the OS temp dir. These never touch
// the Redeemo repo or any database. All git runs are local and offline.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, rmSync as _rm } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export function sh(repo, args) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (r.status !== 0 && !args.includes('--is-ancestor') && !args.includes('-e')) {
    // --is-ancestor and cat-file -e use exit code as data; don't throw for those.
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }
  return r;
}

export function mkRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'vbd-'));
  sh(dir, ['init', '-q', '-b', 'main']);
  sh(dir, ['config', 'user.email', 'test@test']);
  sh(dir, ['config', 'user.name', 'test']);
  sh(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

export function write(repo, rel, content = 'x') {
  const abs = join(repo, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

export function del(repo, rel) {
  rmSync(join(repo, rel), { force: true });
}

export function symlink(repo, rel, target) {
  const abs = join(repo, rel);
  mkdirSync(dirname(abs), { recursive: true });
  try { rmSync(abs, { force: true }); } catch {}
  symlinkSync(target, abs);
}

// Stage everything and commit. Safe: these are isolated temp repos, not the Redeemo repo,
// so the project's git-safety hook (which guards the Bash tool, not spawned git) does not apply.
export function commit(repo, msg) {
  sh(repo, ['add', '-A']);
  sh(repo, ['commit', '-q', '--no-verify', '-m', msg]);
  return sh(repo, ['rev-parse', 'HEAD']).stdout.trim();
}

export function emptyCommit(repo, msg) {
  sh(repo, ['commit', '-q', '--allow-empty', '--no-verify', '-m', msg]);
  return sh(repo, ['rev-parse', 'HEAD']).stdout.trim();
}

export function head(repo) {
  return sh(repo, ['rev-parse', 'HEAD']).stdout.trim();
}

export function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
