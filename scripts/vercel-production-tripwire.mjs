#!/usr/bin/env node
// Read-only production tripwire CLI (pure git; NO network, NO credentials).
//
// It verifies that every main commit relevant to a web project is contained in that
// project's live production deployment SHA (which you supply). See the runbook
// docs/runbooks/vercel-build-decision.md for how to obtain the production SHA read-only and
// for the (owner-gated) operating-model options -- this CLI deliberately has no scheduler,
// secret, webhook, or provider integration.
//
// Usage:
//   node scripts/vercel-production-tripwire.mjs \
//     --key <customer-web|merchant-web|admin-web> \
//     --production-sha <40-hex> \
//     [--baseline <40-hex>] [--main-ref main] [--repo <path>]
//
// Exit codes: 0 = PASS (no alerts), 2 = ALERT (investigate + roll back that project), 1 = usage error.
import { runTripwire } from './vercel-build-decision/tripwire.mjs';
import { KNOWN_WEB_APPS } from './vercel-build-decision/policy.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--key') out.key = argv[++i];
    else if (a === '--production-sha') out.productionSha = argv[++i];
    else if (a === '--baseline') out.baseline = argv[++i];
    else if (a === '--main-ref') out.mainRef = argv[++i];
    else if (a === '--repo') out.repo = argv[++i];
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
const tag = '[vercel-production-tripwire]';
const log = (m) => console.log(`${tag} ${m}`);

if (!opts.key || !KNOWN_WEB_APPS.includes(opts.key) || !opts.productionSha) {
  console.error(`${tag} usage: --key <${KNOWN_WEB_APPS.join('|')}> --production-sha <40-hex> [--baseline <40-hex>] [--main-ref main] [--repo <path>]`);
  process.exit(1);
}

const result = runTripwire({
  projectKey: opts.key,
  productionSha: opts.productionSha,
  baseline: opts.baseline,
  mainRef: opts.mainRef || 'main',
  cwd: opts.repo || process.cwd(),
});

log(`key=${opts.key} productionSha=${opts.productionSha} baseline=${opts.baseline || '(none)'}`);
if (typeof result.checked === 'number') log(`relevantCommitsChecked=${result.checked}`);
if (result.ok) {
  log('PASS: every relevant main commit is contained in the production deployment.');
  process.exit(0);
}
log('ALERT: tripwire failed. Roll the affected project back to Automatic + re-enable native skip, then investigate.');
for (const a of result.alerts || []) log(`alert: ${JSON.stringify(a)}`);
process.exit(2);
