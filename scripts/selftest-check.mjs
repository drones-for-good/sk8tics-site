#!/usr/bin/env node
// Proves each check in check-dist.mjs can fail. For every planted fault it
// copies dist/ to a fresh temp dir, breaks one thing, runs check-dist.mjs
// --root on the copy, and requires a non-zero exit plus a FAIL line naming the
// expected assertion. Run `npm run build` first. No dependencies.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', 'dist');
const CHECK = path.join(HERE, 'check-dist.mjs');

if (!fs.existsSync(DIST)) { console.error('dist/ is missing: run `npm run build` first'); process.exit(2); }

// Replace exactly the first match, and refuse to continue if nothing matched,
// so a fault that silently fails to plant can never count as "caught".
function edit(root, file, find, replace) {
  const p = path.join(root, file);
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(find, replace);
  if (after === before) throw new Error(`could not plant fault: ${find} not found in ${file}`);
  fs.writeFileSync(p, after);
}
const cssFile = (root) => fs.readdirSync(path.join(root, '_astro')).filter((f) => f.endsWith('.css')).map((f) => `_astro/${f}`)[0];

const faults = [
  ['(b) forbidden', 'mailto:x@y.com in privacy.html',
    (r) => edit(r, 'privacy.html', '</main>', '<a href="mailto:x@y.com">x</a></main>')],
  ['(c) forms', 'a <form> added to privacy.html',
    (r) => edit(r, 'privacy.html', '</main>', '<form><input name="q"></form></main>')],
  ['(c) forms', 'website honeypot changed to type=hidden',
    (r) => edit(r, 'support.html', /<input type="text" name="website"/, '<input type="hidden" name="website"')],
  ['(f) header-no-delete', 'Delete account link in the header of index.html',
    (r) => edit(r, 'index.html', '</nav>', '<a href="/delete-account">Delete account</a></nav>')],
  ['(e) flags', 'app.sk8tics.com link in index.html',
    (r) => edit(r, 'index.html', '</main>', '<a href="https://app.sk8tics.com">Log in</a></main>')],
  ['(e) flags', '"Google Play" in index.html',
    (r) => edit(r, 'index.html', '</main>', '<p>Google Play</p></main>')],
  ['(d) external-assets', 'third-party <script src> added',
    (r) => edit(r, 'index.html', '</head>', '<script src="https://evil.example/x.js"></script></head>')],
  ['(l) links', 'href="#nope" added',
    (r) => edit(r, 'support.html', '</main>', '<a href="#nope">nope</a></main>')],
  ['(a) files', 'delete-account.html deleted',
    (r) => fs.rmSync(path.join(r, 'delete-account.html'))],
  ['(g) footer', 'footer Support link removed',
    (r) => edit(r, 'privacy.html', /<a href="\/support">Support<\/a>(?=[\s\S]*<\/footer>)(?![\s\S]*<footer)/, '')],
  ['(m) tokens', '--accent changed in the built CSS',
    (r) => edit(r, cssFile(r), /--accent:\s*#0A8CF5/i, '--accent: #FF0000')],
  ['(j) home-content', 'one feature-card removed',
    (r) => edit(r, 'index.html', 'class="feature-card"', 'class="feature-gone"')],
  // Beyond the spec's list, so (h), (i) and (k) are also shown to fail.
  ['(h) privacy-links', 'a Privacy link to the old privacy page path',
    (r) => edit(r, 'support.html', '</main>', '<a href="/privacy-old">Privacy</a></main>')],
  ['(i) app-store', 'a second App Store link in index.html',
    (r) => edit(r, 'index.html', '</main>', '<a href="https://apps.apple.com/app/id6809558326">App Store</a></main>')],
  ['(k) header-contact', 'header Contact link pointed at /support',
    (r) => edit(r, 'delete-account.html', '<a href="/#contact">Contact</a>', '<a href="/support#contact">Contact</a>')],
  ['scanned', 'all <header> elements stripped from support.html',
    (r) => edit(r, 'support.html', /<header class="site-head">[\s\S]*?<\/header>/g, '')],
];

let missed = 0;
for (const [assertion, what, plant] of faults) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk8tics-selftest-'));
  try {
    fs.cpSync(DIST, tmp, { recursive: true });
    plant(tmp);
    const run = spawnSync(process.execPath, [CHECK, '--root', tmp], { encoding: 'utf8' });
    const named = run.stdout.split('\n').some((l) => l.startsWith(`FAIL ${assertion}`));
    if (run.status !== 0 && named) console.log(`caught: ${assertion} (${what})`);
    else {
      missed++;
      console.log(`MISSED: ${assertion} (${what}): exit ${run.status}, FAIL line ${named ? 'present' : 'absent'}`);
      process.stdout.write(run.stdout);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// The unmodified copy must pass, or "caught" would mean nothing.
{
  const run = spawnSync(process.execPath, [CHECK, '--root', DIST], { encoding: 'utf8' });
  if (run.status !== 0) { missed++; console.log('MISSED: the clean dist/ does not pass check-dist.mjs'); process.stdout.write(run.stdout); }
  else console.log('clean dist/ passes');
}

console.log(missed ? `${missed} fault(s) not caught` : `all ${faults.length} planted faults caught`);
process.exit(missed ? 1 : 0);
