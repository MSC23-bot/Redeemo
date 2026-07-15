#!/usr/bin/env node
// Vercel "Ignored Build Step" entry point for the three Redeemo web projects.
//
// Configure per project (Settings -> Build and Deployment -> Ignored Build Step ->
// "Run my Node script"), with the Root Directory being apps/<app>:
//
//   node ../../scripts/vercel-should-build.mjs <project-key>
//
// where <project-key> is one of: customer-web | merchant-web | admin-web.
//
// Vercel contract: exit 1 => BUILD (continue), exit 0 => SKIP (abort, mark CANCELED).
// This script's default outcome is BUILD; it exits 0 (SKIP) ONLY when it can prove every
// changed path since the last successful deployment is irrelevant to <project-key>.
//
// --probe : logs the evidence and the decision it WOULD make, then ALWAYS exits 1 (BUILD).
//           Used for a no-risk pilot; it can never skip anything.
import { computeDecision } from './vercel-build-decision/should-build.mjs';

const args = process.argv.slice(2);
const probe = args.includes('--probe');
const projectKey = args.find((a) => !a.startsWith('-'));

const prevSha = process.env.VERCEL_GIT_PREVIOUS_SHA;
const headSha = process.env.VERCEL_GIT_COMMIT_SHA;

const decision = computeDecision({ projectKey, prevSha, headSha, cwd: process.cwd() });

const tag = '[vercel-should-build]';
const log = (m) => console.log(`${tag} ${m}`);
log(`project=${projectKey || '(none)'} probe=${probe} cwd=${process.cwd()}`);
log(`VERCEL_GIT_PREVIOUS_SHA=${prevSha || '(unset)'}`);
log(`VERCEL_GIT_COMMIT_SHA=${headSha || '(unset)'}`);
log(`VERCEL_ENV=${process.env.VERCEL_ENV || '(unset)'} VERCEL_GIT_COMMIT_REF=${process.env.VERCEL_GIT_COMMIT_REF || '(unset)'}`);
if (typeof decision.detail?.changedCount === 'number') {
  log(`changedPaths=${decision.detail.changedCount}`);
}
if (decision.detail?.triggers?.length) {
  log(`buildTriggers=${decision.detail.triggers.join(', ')}`);
}
log(`decision=${decision.build ? 'BUILD' : 'SKIP'} reason=${decision.reason}`);

if (probe) {
  log('PROBE MODE: forcing exit 1 (BUILD) regardless of the decision above; nothing can be skipped.');
  process.exit(1);
}

process.exit(decision.build ? 1 : 0);
