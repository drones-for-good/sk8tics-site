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

// The (e) app-link fault depends on LOGIN_ENABLED, so read it the way
// check-dist.mjs readConfig() does (same regex, same parse) ...
function readLoginEnabled() {
  const text = fs.readFileSync(path.resolve(HERE, '..', 'src/config.ts'), 'utf8');
  const m = text.match(new RegExp('^export const LOGIN_ENABLED = (.+);\\s*$', 'm'));
  let value;
  try { value = m && JSON.parse(m[1].replace(/^'(.*)'$/, '"$1"')); } catch { value = undefined; }
  if (typeof value !== 'boolean') { console.error('src/config.ts: cannot read LOGIN_ENABLED'); process.exit(2); }
  return value;
}
const LOGIN_ENABLED = readLoginEnabled();

// ... and require it to equal the LOGIN_ENABLED= that check-dist.mjs prints for
// the clean dist/, so the two can never silently disagree.
const clean = spawnSync(process.execPath, [CHECK, '--root', DIST], { encoding: 'utf8' });
{
  const printed = clean.stdout.match(/LOGIN_ENABLED=(true|false)\b/);
  if (!printed || printed[1] !== String(LOGIN_ENABLED)) {
    console.error(`LOGIN_ENABLED mismatch: src/config.ts says ${LOGIN_ENABLED}, check-dist.mjs printed ${printed ? printed[1] : 'no LOGIN_ENABLED= (its (e) check failed on the clean dist/; rebuild?)'}`);
    process.stdout.write(clean.stdout);
    process.stderr.write(clean.stderr);
    process.exit(2);
  }
}

// Replace exactly the first match, and refuse to continue if nothing matched,
// so a fault that silently fails to plant can never count as "caught".
function edit(root, file, find, replace) {
  const p = path.join(root, file);
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(find, replace);
  if (after === before) throw new Error(`could not plant fault: ${find} not found in ${file}`);
  fs.writeFileSync(p, after);
}
// Replace every occurrence in every .html file under root, and refuse to
// continue if there was none.
function stripAll(root, find, replace) {
  let hits = 0;
  for (const e of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith('.html')) continue;
    const p = path.join(e.parentPath ?? e.path, e.name);
    const parts = fs.readFileSync(p, 'utf8').split(find);
    hits += parts.length - 1;
    fs.writeFileSync(p, parts.join(replace));
  }
  if (!hits) throw new Error(`could not plant fault: ${find} not found in any .html file`);
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
  // With the flag off a stray app link must be caught; with it on, the
  // links the header builds must be missed if they go away.
  LOGIN_ENABLED
    ? ['(e) flags', 'app.sk8tics.com stripped from every built HTML file',
      (r) => stripAll(r, 'app.sk8tics.com', 'app.example.invalid')]
    : ['(e) flags', 'app.sk8tics.com link in index.html',
      (r) => edit(r, 'index.html', '</main>', '<a href="https://app.sk8tics.com">Log in</a></main>')],
  ['(e) flags', '"Google Play" in index.html',
    (r) => edit(r, 'index.html', '</main>', '<p>Google Play</p></main>')],
  ['(e) flags', '"Google Play" outside <main> on privacy.html',
    (r) => edit(r, 'privacy.html', '</body>', '<p>Google Play</p></body>')],
  ['(e) flags', '"Google Play" in delete-account.html',
    (r) => edit(r, 'delete-account.html', '</main>', '<p>Google Play</p></main>')],
  ['(e) flags', 'play.google.com link in privacy.html',
    (r) => edit(r, 'privacy.html', '</main>', '<a href="https://play.google.com/x">x</a></main>')],
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
if (clean.status !== 0) { missed++; console.log('MISSED: the clean dist/ does not pass check-dist.mjs'); process.stdout.write(clean.stdout); }
else console.log('clean dist/ passes');

console.log(missed ? `${missed} fault(s) not caught` : `all ${faults.length} planted faults caught`);
process.exit(missed ? 1 : 0);
