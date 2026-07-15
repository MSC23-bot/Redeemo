// Executable architecture guard for the SAFE path policy.
//
// The policy classifies root `src/**`, `prisma/**`, sibling apps (incl. `apps/customer-app`),
// most of `tests/**`, docs, etc. as SAFE to ignore for a given web project. That is only valid
// while the web apps have NO build-time dependency reaching into those locations. This test
// proves that invariant against the live repo and FAILS if any web app acquires such a
// dependency, whether via a relative import OR a resolved alias (tsconfig `paths`/`baseUrl`/
// `extends`, package `imports`) OR a workspace/@redeemo/file package dep. If it ever fails,
// either remove the coupling or make that path a BUILD trigger in policy.mjs -- do not weaken
// this test.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, dirname, sep } from 'node:path';
import { repoRoot } from '../git.mjs';
import { KNOWN_WEB_APPS, classifyPath } from '../policy.mjs';

const REPO = repoRoot(process.cwd()) || process.cwd();
const SRC_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const STYLE_EXT = new Set(['.css', '.scss', '.sass', '.less']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.turbo', '.vercel']);

function walk(dir, acc = { files: [], symlinks: [] }) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isSymbolicLink()) {
      acc.symlinks.push(full); // do NOT follow; resolved separately so it can't hide an escape
    } else if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, acc);
    } else if (e.isFile()) {
      const dot = e.name.lastIndexOf('.');
      const ext = dot >= 0 ? e.name.slice(dot) : '';
      if (SRC_EXT.has(ext) || STYLE_EXT.has(ext)) acc.files.push(full);
    }
  }
  return acc;
}

// Stylesheet dependency specifiers: @import "..." and url(...). Only RELATIVE specifiers can
// escape into the repo; bare (tailwindcss), absolute web ("/fonts/..."), data:, and http(s)
// are not filesystem escapes and are ignored by the caller.
const CSS_PATTERNS = [
  /@import\s+['"]([^'"]+)['"]/g,
  /url\(\s*['"]?([^'")]+?)['"]?\s*\)/g,
];
function cssSpecifiers(src) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const found = new Set();
  for (const re of CSS_PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(clean)) !== null) found.add(m[1].trim());
  }
  return [...found];
}

function extOf(file) {
  const dot = file.lastIndexOf('.');
  return dot >= 0 ? file.slice(dot) : '';
}

// Build-time module-resolution seams in a Next.js config that could remap imports into a SAFE
// location. Verified against Next.js 15 (webpack + Turbopack): none of these is present in the
// three app configs today (which only use outputFileTracingRoot/images/headers — not resolution
// mechanisms). Any future introduction fails the guard, forcing an explicit proof or a policy
// change. NOTE: this is a conservative presence check, not a full config evaluation.
const NEXT_CONFIG_NAMES = ['next.config.ts', 'next.config.js', 'next.config.mjs', 'next.config.cjs'];
const NEXT_SEAM_PATTERNS = [
  ['transpilePackages', /\btranspilePackages\b/],
  ['modularizeImports', /\bmodularizeImports\b/],
  ['experimental.externalDir', /\bexternalDir\b/],
  ['webpack resolve.alias', /resolve\s*\.\s*alias\b/],
  ['webpack config function', /\bwebpack\s*[:(]/],
  ['turbopack config', /\bturbopack\s*[:(]/],
  ['turbopack/experimental resolveAlias', /\bresolveAlias\b/],
  ['sassOptions / includePaths', /\b(sassOptions|includePaths)\b/],
];
function nextConfigSeams(appDir) {
  const hits = [];
  for (const name of NEXT_CONFIG_NAMES) {
    const p = join(appDir, name);
    if (!existsSync(p)) continue;
    let src;
    try { src = readFileSync(p, 'utf8'); } catch { hits.push(`${name}: unreadable`); continue; }
    const clean = stripComments(src);
    for (const [label, re] of NEXT_SEAM_PATTERNS) {
      if (re.test(clean)) hits.push(`${name}: ${label}`);
    }
  }
  return hits;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

// Strip // and /* */ comments while RESPECTING string literals, so a `/*` inside a JSON string
// (e.g. the glob "**/*.ts" in a tsconfig `include`) is preserved. A naive regex stripper would
// treat that `/*` as a comment opener and corrupt the JSON.
function stripJsonComments(s) {
  let out = '';
  let inStr = false, strCh = '', esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; out += c; continue; }
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out;
}

function parseJsonc(text) {
  // Plain JSON (the common case, incl. the app tsconfigs) parses directly.
  try { return JSON.parse(text); } catch {}
  // Fallback for genuine JSONC: strip comments (string-safe) + trailing commas, then parse.
  const cleaned = stripJsonComments(text).replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(cleaned);
}

const SPEC_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
];

function specifiers(src) {
  const clean = stripComments(src);
  const found = new Set();
  for (const re of SPEC_PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(clean)) !== null) found.add(m[1]);
  }
  return [...found];
}

// Load an app's TS path-mapping config, walking the COMPLETE `extends` chain (string and array
// forms). Returns:
//   { baseUrlAbs, paths, bareExtends, externalConfigAbs, chainError }
// where externalConfigAbs lists every resolved parent config FILE that sits OUTSIDE the app (a
// change to such a file affects this app's compilation, so it is a build dependency scanApp must
// classify). In-app parents need no tracking (changes fall under apps/<project>/**). A bare
// (node_modules) extends or an unsupported extends form is recorded so scanApp fails the guard.
function loadTsPathConfig(appDir) {
  const acc = { baseUrlAbs: appDir, paths: {}, bareExtends: null, externalConfigAbs: [], chainError: null };
  loadTsconfigInto(join(appDir, 'tsconfig.json'), appDir, acc, new Set());
  return acc;
}

function loadTsconfigInto(tsconfigPath, appDir, acc, seen) {
  if (!tsconfigPath || seen.has(tsconfigPath)) return; // cycle guard
  seen.add(tsconfigPath);
  if (!existsSync(tsconfigPath)) return; // missing: the declared path was already classified by the caller
  let cfg;
  try { cfg = parseJsonc(readFileSync(tsconfigPath, 'utf8')); } catch { acc.chainError = `unparsable:${tsconfigPath}`; return; }
  const dir = dirname(tsconfigPath);

  const ext = cfg.extends;
  const extList = Array.isArray(ext) ? ext : (ext !== undefined ? [ext] : []);
  for (const entry of extList) {
    if (typeof entry !== 'string') { acc.chainError = 'non-string-extends'; continue; }
    if (!entry.startsWith('.')) { acc.bareExtends = entry; continue; } // node_modules config: unresolved
    let parent = resolve(dir, entry);
    if (!parent.endsWith('.json')) parent += '.json';
    // The parent config FILE is a build dependency. Record it if it sits outside the app so
    // scanApp can classify it (whether or not the file currently exists / parses).
    if (escapesApp(appDir, parent)) acc.externalConfigAbs.push(parent);
    loadTsconfigInto(parent, appDir, acc, seen); // follow (parents first) to merge paths/baseUrl
  }

  const co = cfg.compilerOptions || {};
  if (co.paths) acc.paths = { ...acc.paths, ...co.paths }; // child overrides parent (processed after)
  if (co.baseUrl !== undefined) acc.baseUrlAbs = resolve(dir, co.baseUrl);
  else if (co.paths) acc.baseUrlAbs = dir; // paths without baseUrl resolve relative to this tsconfig
}

function loadPkgImports(appDir) {
  const p = join(appDir, 'package.json');
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')).imports || {}; } catch { return {}; }
}

// Resolve a bare/aliased specifier to absolute target path(s) it could map to. Returns [] for a
// plain node_modules package (no repo target).
function aliasTargets(spec, cfg, pkgImports, appDir) {
  const out = [];
  // tsconfig paths
  for (const [pattern, mappings] of Object.entries(cfg.paths || {})) {
    const star = pattern.indexOf('*');
    if (star === -1) {
      if (spec === pattern) for (const m of mappings) out.push(resolve(cfg.baseUrlAbs, m));
    } else {
      const pre = pattern.slice(0, star);
      const suf = pattern.slice(star + 1);
      if (spec.startsWith(pre) && spec.endsWith(suf) && spec.length >= pre.length + suf.length) {
        const mid = spec.slice(pre.length, spec.length - suf.length);
        for (const m of mappings) out.push(resolve(cfg.baseUrlAbs, m.replace('*', mid)));
      }
    }
  }
  // package.json "imports" subpath imports (#foo, #foo/*)
  if (spec.startsWith('#')) {
    for (const [pattern, target] of Object.entries(pkgImports)) {
      const targets = typeof target === 'string' ? [target]
        : (target && typeof target === 'object' ? Object.values(target).filter((v) => typeof v === 'string') : []);
      const star = pattern.indexOf('*');
      if (star === -1) {
        if (spec === pattern) for (const t of targets) out.push(resolve(appDir, t));
      } else {
        const pre = pattern.slice(0, star);
        const suf = pattern.slice(star + 1);
        if (spec.startsWith(pre) && spec.endsWith(suf)) {
          const mid = spec.slice(pre.length, spec.length - suf.length);
          for (const t of targets) out.push(resolve(appDir, t.replace('*', mid)));
        }
      }
    }
  }
  return out;
}

function escapesApp(appDir, target) {
  const relToApp = relative(appDir, target);
  return relToApp === '..' || relToApp.startsWith(`..${sep}`) || relToApp.startsWith('..');
}

// A module target may be a file (e.g. src/x.ts) OR a directory (e.g. src, resolving to
// src/index). classifyPath keys SAFE dirs by their `foo/` prefix, so probe BOTH the path itself
// and a child of it. If either classifies SAFE, importing it is a wrong-SKIP coupling.
function targetIsSafe(repoRel, key) {
  return classifyPath(repoRel, key) === 'SAFE' || classifyPath(`${repoRel}/x`, key) === 'SAFE';
}

// Scan one app directory; return violations (imports/symlinks into a SAFE-classified location).
function scanApp({ appDir, repo, key }) {
  const cfg = loadTsPathConfig(appDir);
  const pkgImports = loadPkgImports(appDir);
  const { files, symlinks } = walk(appDir);
  const violations = [];

  // A bare-package tsconfig `extends` we cannot resolve is an UNPROVEN seam: it could define a
  // SAFE-escaping path alias. Fail rather than silently assume it is clean.
  if (cfg.bareExtends) {
    violations.push(`apps/${key}: tsconfig extends a bare package "${cfg.bareExtends}" that cannot be resolved to prove it defines no SAFE-escaping path alias`);
  }
  // An unsupported / unparsable extends form is also an unproven seam => fail open.
  if (cfg.chainError) {
    violations.push(`apps/${key}: tsconfig extends chain could not be fully resolved (${cfg.chainError}); cannot prove no SAFE escape`);
  }
  // Each EXTERNAL parent tsconfig in the extends chain is itself a build dependency: a change to
  // it can alter this app's compilation. If its repo path is SAFE-classified, a change there
  // would wrongly SKIP this app. (In-app parents are covered by apps/<project>/**.)
  for (const parentAbs of cfg.externalConfigAbs) {
    const repoRel = relative(repo, parentAbs).split(sep).join('/');
    if (targetIsSafe(repoRel, key)) {
      violations.push(`apps/${key}: tsconfig extends external config ${repoRel} which is SAFE-classified (a change there could wrongly SKIP this app)`);
    }
  }
  // Executable next.config resolution-seam guard: fail if a build-time module-resolution seam is
  // introduced (we cannot resolve where it maps without executing the config, so treat presence
  // as an unproven escape). outputFileTracingRoot/images/headers are NOT resolution seams.
  for (const seam of nextConfigSeams(appDir)) {
    violations.push(`apps/${key}: next.config introduces a build-resolution seam (${seam}); prove it cannot map into a SAFE location or make that path a BUILD trigger`);
  }

  for (const file of files) {
    const fileDir = dirname(file);
    const isStyle = STYLE_EXT.has(extOf(file));
    // CSS: only relative @import/url can escape into the repo. JS/TS: relative + resolved aliases.
    const specs = isStyle ? cssSpecifiers(readFileSync(file, 'utf8')) : specifiers(readFileSync(file, 'utf8'));
    for (const spec of specs) {
      const targets = spec.startsWith('.')
        ? [resolve(fileDir, spec)]
        : (isStyle ? [] : aliasTargets(spec, cfg, pkgImports, appDir));
      for (const target of targets) {
        if (!escapesApp(appDir, target)) continue; // stays inside the app
        const targetRepoRel = relative(repo, target).split(sep).join('/');
        if (targetIsSafe(targetRepoRel, key)) {
          violations.push(`${relative(repo, file)} -> ${spec}  (resolves to ${targetRepoRel}, SAFE-classified)`);
        }
      }
    }
  }
  // Symlink seam: a symlink inside the app whose real target is a SAFE location outside the app
  // would make that location importable via an in-app-looking path. Flag it. Compare on realpath'd
  // roots so the macOS /var -> /private/var indirection does not skew the relative paths.
  let realRepo = repo;
  let realAppDir = appDir;
  try { realRepo = realpathSync(repo); realAppDir = realpathSync(appDir); } catch {}
  for (const link of symlinks) {
    let real;
    try { real = realpathSync(link); } catch { continue; }
    if (!escapesApp(realAppDir, real)) continue;
    const realRepoRel = relative(realRepo, real).split(sep).join('/');
    if (targetIsSafe(realRepoRel, key)) {
      violations.push(`${relative(realRepo, link)} (symlink) -> ${realRepoRel} (SAFE-classified)`);
    }
  }
  return violations;
}

// ---------------- Live-repo assertions ----------------

for (const app of KNOWN_WEB_APPS) {
  test(`apps/${app}: no build-reachable dependency (relative/alias import, CSS @import/url, symlink, bare-extends) couples to a SAFE location`, () => {
    const appDir = resolve(REPO, 'apps', app);
    if (!existsSync(appDir)) return; // app not present in this checkout
    assert.ok(walk(appDir).files.length > 0, `expected source files under apps/${app}`);
    const violations = scanApp({ appDir, repo: REPO, key: app });
    assert.deepEqual(
      violations,
      [],
      `apps/${app} has ${violations.length} import(s) into a SAFE-classified location (wrong-SKIP risk):\n  ${violations.join('\n  ')}\nEither remove the coupling or make that path a BUILD trigger in policy.mjs.`,
    );
  });

  test(`apps/${app}: package.json has no workspace/@redeemo/file dependency`, () => {
    const pkgPath = resolve(REPO, 'apps', app, 'package.json');
    if (!existsSync(pkgPath)) return;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const bad = Object.entries(deps).filter(
      ([name, ver]) =>
        String(ver).startsWith('file:') ||
        String(ver).startsWith('workspace:') ||
        (name.startsWith('@redeemo/') && name !== pkg.name),
    );
    assert.deepEqual(bad, [], `apps/${app} declares a cross-workspace dependency: ${JSON.stringify(bad)}`);
  });
}

// ---------------- Synthetic alias-bypass regressions (Codex reproduction) ----------------

const temps = [];
function tmpApp() {
  const repo = mkdtempSync(join(tmpdir(), 'vbd-arch-'));
  temps.push(repo);
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'x.ts'), 'export const x = 1;');
  const appDir = join(repo, 'apps', 'merchant-web');
  mkdirSync(join(appDir, 'lib'), { recursive: true });
  return { repo, appDir };
}
after(() => temps.forEach((d) => { try { rmSync(d, { recursive: true, force: true }); } catch {} }));

test('ALIAS BYPASS: tsconfig paths @root/* -> ../../src/* importing @root/x is flagged', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { baseUrl: '.', paths: { '@root/*': ['../../src/*'], '@/*': ['./*'] } },
  }));
  writeFileSync(join(appDir, 'lib', 'consumer.ts'), `import { x } from '@root/x';\nexport const y = x;\n`);
  const violations = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.match(violations[0], /@root\/x/);
  assert.match(violations[0], /src\/x/);
});

test('control: in-app alias @/* -> ./* is NOT flagged', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } },
  }));
  mkdirSync(join(appDir, 'components'), { recursive: true });
  writeFileSync(join(appDir, 'components', 'a.ts'), 'export const a = 1;');
  writeFileSync(join(appDir, 'lib', 'consumer.ts'), `import { a } from '@/components/a';\nexport const b = a;\n`);
  assert.deepEqual(scanApp({ appDir, repo, key: 'merchant-web' }), []);
});

test('ALIAS BYPASS via extends: parent tsconfig defines the escaping alias', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(repo, 'apps', 'merchant-web', 'tsconfig.base.json'), JSON.stringify({
    compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['../../src/*'] } },
  }));
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ extends: './tsconfig.base.json' }));
  writeFileSync(join(appDir, 'lib', 'consumer.ts'), `import { x } from '@shared/x';\nexport const y = x;\n`);
  const violations = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.match(violations[0], /@shared\/x/);
});

test('package.json #imports subpath escaping into src/ is flagged', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: '@redeemo/merchant-web', imports: { '#backend/*': '../../src/*' } }));
  writeFileSync(join(appDir, 'lib', 'consumer.ts'), `import { x } from '#backend/x';\nexport const y = x;\n`);
  const violations = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.match(violations[0], /#backend\/x/);
});

test('relative-import guard still active: ../../src/x is flagged', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  writeFileSync(join(appDir, 'lib', 'consumer.ts'), `import { x } from '../../../src/x';\nexport const y = x;\n`);
  const violations = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.match(violations[0], /src\/x/);
});

test('SYMLINK seam: an in-app symlink to root src/ is flagged', () => {
  const { repo, appDir } = tmpApp();
  // apps/merchant-web/shared -> ../../src  (makes src importable via ./shared/*)
  try {
    symlinkSync(resolve(repo, 'src'), join(appDir, 'shared'));
  } catch {
    return; // symlink creation not permitted in this environment; skip
  }
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  const violations = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.match(violations[0], /symlink/);
  assert.match(violations[0], /src/);
});

test('CSS @import escaping into root src/ is flagged', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  writeFileSync(join(appDir, 'lib', 'styles.css'), `@import '../../../src/shared.css';\n.a { color: red; }\n`);
  const violations = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.match(violations[0], /src\/shared\.css/);
});

test('CSS url() escaping into root src/ is flagged; bare/absolute/tailwind imports are NOT', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  writeFileSync(join(appDir, 'lib', 'a.css'),
    `@import "tailwindcss";\n@font-face { src: url('/fonts/x.ttf'); }\n.b { background: url(../../../src/bg.png); }\n`);
  const violations = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.match(violations[0], /src\/bg\.png/);
});

test('bare-package tsconfig extends is flagged (future introduction fails CI)', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ extends: '@tsconfig/next/tsconfig.json', compilerOptions: {} }));
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  const violations = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.ok(violations.some((v) => /bare package "@tsconfig\/next/.test(v)), JSON.stringify(violations));
});

test('relative tsconfig extends is NOT flagged as bare (it is resolved)', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }));
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ extends: './tsconfig.base.json' }));
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  assert.deepEqual(scanApp({ appDir, repo, key: 'merchant-web' }), []);
});

// ---- External tsconfig-inheritance as a build dependency (Codex round-4 finding 1) ----

test('EXTERNAL relative extends into a SAFE root config is flagged', () => {
  const { repo, appDir } = tmpApp();
  // Root tsconfig has NO alias, only a compiler option that can affect the build. It is SAFE.
  writeFileSync(join(repo, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }));
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.json' }));
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  const v = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.ok(v.some((x) => /extends external config tsconfig\.json/.test(x)), JSON.stringify(v));
});

test('in-app relative extends is NOT flagged (covered by apps/<project>/**)', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: { strict: true } }));
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ extends: './tsconfig.base.json' }));
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  assert.deepEqual(scanApp({ appDir, repo, key: 'merchant-web' }), []);
});

test('ARRAY extends containing a SAFE external parent is flagged', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(repo, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }));
  writeFileSync(join(appDir, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: {} }));
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ extends: ['./tsconfig.base.json', '../../tsconfig.json'] }));
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  const v = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.ok(v.some((x) => /extends external config tsconfig\.json/.test(x)), JSON.stringify(v));
});

test('external extends into a BUILD-classified config (tests/fixtures) is NOT flagged', () => {
  const { repo, appDir } = tmpApp();
  mkdirSync(join(repo, 'tests', 'fixtures'), { recursive: true });
  writeFileSync(join(repo, 'tests', 'fixtures', 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ extends: '../../tests/fixtures/tsconfig.json' }));
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  assert.deepEqual(scanApp({ appDir, repo, key: 'merchant-web' }), []);
});

test('missing external SAFE parent is still flagged (dependency on the declared path)', () => {
  const { repo, appDir } = tmpApp();
  // Do NOT create repo/tsconfig.json; the declared external dependency path is still SAFE.
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.json' }));
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  const v = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.ok(v.some((x) => /extends external config tsconfig\.json/.test(x)), JSON.stringify(v));
});

test('cyclic in-app extends chain does not crash and is not a violation', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'a.json'), JSON.stringify({ extends: './tsconfig.json' }));
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ extends: './a.json' }));
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  assert.deepEqual(scanApp({ appDir, repo, key: 'merchant-web' }), []);
});

test('non-string (unsupported) extends entry fails open with a chain-error violation', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ extends: [123] }));
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  const v = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.ok(v.some((x) => /extends chain could not be fully resolved/.test(x)), JSON.stringify(v));
});

// ---- next.config resolution-seam guard (Codex round-4 finding 2) ----

test('next.config with a resolution seam (transpilePackages) is flagged', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  writeFileSync(join(appDir, 'next.config.ts'), `const c = { transpilePackages: ['x'] };\nexport default c;\n`);
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  const v = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.ok(v.some((x) => /build-resolution seam.*transpilePackages/.test(x)), JSON.stringify(v));
});

test('next.config with webpack resolve.alias is flagged', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  writeFileSync(join(appDir, 'next.config.js'), `module.exports = { webpack(config){ config.resolve.alias['@x']='../../src'; return config; } };\n`);
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  const v = scanApp({ appDir, repo, key: 'merchant-web' });
  assert.ok(v.some((x) => /build-resolution seam/.test(x)), JSON.stringify(v));
});

test('next.config with only outputFileTracingRoot/images/headers is NOT flagged', () => {
  const { repo, appDir } = tmpApp();
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  writeFileSync(join(appDir, 'next.config.ts'),
    `import path from 'path';\nconst c = { outputFileTracingRoot: path.join(__dirname,'../../'), images: { remotePatterns: [] }, async headers(){ return []; } };\nexport default c;\n`);
  writeFileSync(join(appDir, 'lib', 'a.ts'), 'export const a = 1;');
  assert.deepEqual(scanApp({ appDir, repo, key: 'merchant-web' }), []);
});

test('alias into a BUILD-classified location (tests/fixtures) is NOT a violation', () => {
  const { repo, appDir } = tmpApp();
  mkdirSync(join(repo, 'tests', 'fixtures'), { recursive: true });
  writeFileSync(join(repo, 'tests', 'fixtures', 'data.ts'), 'export const d = 1;');
  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { baseUrl: '.', paths: { '@fix/*': ['../../tests/fixtures/*'] } },
  }));
  writeFileSync(join(appDir, 'lib', 'consumer.ts'), `import { d } from '@fix/data';\nexport const e = d;\n`);
  // tests/fixtures is a GLOBAL BUILD trigger, so the build decision already covers it => no violation.
  assert.deepEqual(scanApp({ appDir, repo, key: 'merchant-web' }), []);
});
