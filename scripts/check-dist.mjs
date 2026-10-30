#!/usr/bin/env node
// Checks the built site in dist/ against DRO-102. No dependencies.
//
//   node scripts/check-dist.mjs                 checks ./dist
//   node scripts/check-dist.mjs --root <dir>    checks another built copy (used by selftest-check.mjs)
//   node scripts/check-dist.mjs --source <dir>  compares the <main> text of privacy, delete-account
//                                               and support with the approved source pages in <dir>
//
// Prints a "scanned:" line, then PASS or FAIL per assertion, and exits 1 on any FAIL.
// Every assertion has a FAIL path that scripts/selftest-check.mjs exercises.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// ------------------------------------------------------------------ args

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  if (!args[i + 1]) { console.error(`${name} needs a directory`); process.exit(2); }
  return path.resolve(args[i + 1]);
}
const ROOT = arg('--root') ?? path.join(REPO, 'dist');
const SOURCE = arg('--source');

// ------------------------------------------------------------------ config

function readConfig() {
  const text = fs.readFileSync(path.join(REPO, 'src/config.ts'), 'utf8');
  const get = (name) => {
    const m = text.match(new RegExp(`^export const ${name} = (.+);\\s*$`, 'm'));
    if (!m) throw new Error(`src/config.ts: cannot read ${name}`);
    return JSON.parse(m[1].replace(/^'(.*)'$/, '"$1"'));
  };
  return {
    CONTACT_URL: get('CONTACT_URL'),
    APP_STORE_URL: get('APP_STORE_URL'),
    ANDROID_ENABLED: get('ANDROID_ENABLED'),
    LOGIN_ENABLED: get('LOGIN_ENABLED'),
  };
}
const CONFIG = readConfig();

// ------------------------------------------------------------------ results

let failed = 0;
function pass(label, detail = '') { console.log(`PASS ${label}${detail ? `: ${detail}` : ''}`); }
function fail(label, detail) { failed++; console.log(`FAIL ${label}: ${detail}`); }
function report(label, problems, okDetail) {
  if (problems.length) fail(label, problems.slice(0, 8).join('; ') + (problems.length > 8 ? `; and ${problems.length - 8} more` : ''));
  else pass(label, okDetail);
}

// ------------------------------------------------------------------ tiny HTML parser

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', middot: '·', rarr: '→',
  minus: '−', copy: '©', hellip: '…', commat: '@',
};
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

function parseAttrs(s) {
  const attrs = {};
  for (const m of s.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m.index > last) cur.children.push({ text: html.slice(last, m.index) });
    last = re.lastIndex;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      let n = cur;
      while (n && n.tag !== tag) n = n.parent;
      if (n && n.parent) cur = n.parent;
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const el = { tag, attrs: parseAttrs(m[3]), children: [], parent: cur };
      cur.children.push(el);
      if (RAW.has(tag)) {
        const end = html.toLowerCase().indexOf(`</${tag}`, last);
        const stop = end === -1 ? html.length : end;
        el.children.push({ text: html.slice(last, stop) });
        const close = html.indexOf('>', stop);
        re.lastIndex = last = close === -1 ? html.length : close + 1;
      } else if (!VOID.has(tag) && !m[3].trim().endsWith('/')) {
        cur = el;
      }
    }
  }
  if (last < html.length) cur.children.push({ text: html.slice(last) });
  return root;
}

function all(node, pred, out = []) {
  for (const c of node.children ?? []) {
    if (c.tag) { if (pred(c)) out.push(c); all(c, pred, out); }
  }
  return out;
}
const byTag = (node, tag) => all(node, (n) => n.tag === tag);
const hasClass = (n, c) => (n.attrs.class ?? '').split(/\s+/).includes(c);
// Block-level boundaries count as whitespace (Astro's compressHTML drops the
// newlines between blocks, which renders the same). Inline boundaries do not,
// so lost whitespace around <strong>, <em> or <a> still shows as a difference.
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'button', 'dd', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'input', 'label', 'li',
  'main', 'nav', 'ol', 'p', 'section', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'tr', 'ul']);
function text(node) {
  if (node.text !== undefined) return node.text;
  if (node.tag === 'script' || node.tag === 'style') return '';
  const inner = (node.children ?? []).map(text).join('');
  return BLOCK.has(node.tag) ? ` ${inner} ` : inner;
}
const plain = (node) => decode(text(node)).replace(/\s+/g, ' ').trim();
function ancestors(n) { const out = []; for (let p = n.parent; p; p = p.parent) out.push(p); return out; }

// ------------------------------------------------------------------ source comparison mode

if (SOURCE) {
  for (const page of ['privacy', 'delete-account', 'support']) {
    const label = `source:${page}`;
    const srcFile = path.join(SOURCE, `${page}.html`);
    const builtFile = path.join(ROOT, `${page}.html`);
    if (!fs.existsSync(srcFile)) { fail(label, `missing ${srcFile}`); continue; }
    if (!fs.existsSync(builtFile)) { fail(label, `missing ${builtFile}`); continue; }
    const mains = [srcFile, builtFile].map((f) => byTag(parse(fs.readFileSync(f, 'utf8')), 'main'));
    if (mains[0].length !== 1 || mains[1].length !== 1) { fail(label, 'expected exactly one <main> in each'); continue; }
    const [a, b] = mains.map((m) => plain(m[0]));
    if (a === b) { pass(label, `${a.length} characters of <main> text identical`); continue; }
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    fail(label, `text differs at character ${i}: source "…${a.slice(Math.max(0, i - 40), i + 40)}…" vs built "…${b.slice(Math.max(0, i - 40), i + 40)}…"`);
  }
  process.exit(failed ? 1 : 0);
}

// ------------------------------------------------------------------ load dist

if (!fs.existsSync(ROOT)) { console.log(`FAIL (a) files: ${ROOT} does not exist`); process.exit(1); }

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const rel = (f) => path.relative(ROOT, f);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const pages = new Map(htmlFiles.map((f) => {
  const src = fs.readFileSync(f, 'utf8');
  return [rel(f), { src, doc: parse(src) }];
}));
const raw = new Map(files.map((f) => [rel(f), fs.readFileSync(f, 'latin1')]));

// ------------------------------------------------------------------ scanned

{
  let headers = 0, footers = 0, forms = 0;
  for (const { doc } of pages.values()) {
    headers += byTag(doc, 'header').length;
    footers += byTag(doc, 'footer').length;
    forms += byTag(doc, 'form').length;
  }
  console.log(`scanned: ${htmlFiles.length} html files, ${headers} <header>, ${footers} <footer>, ${forms} <form>`);
  const want = [htmlFiles.length, headers, footers, forms].join(',');
  if (want !== '4,4,4,2') fail('scanned', `expected 4 html files, 4 <header>, 4 <footer>, 2 <form>`);
}

// ------------------------------------------------------------------ (a) files

{
  const problems = [];
  for (const f of ['index.html', 'support.html', 'privacy.html', 'delete-account.html', 'CNAME']) {
    if (!raw.has(f)) problems.push(`missing ${f}`);
  }
  if (raw.has('CNAME') && raw.get('CNAME').trim() !== 'sk8tics.com') problems.push('CNAME is not sk8tics.com');
  report('(a) files', problems, '4 pages and CNAME (sk8tics.com)');
}

// ------------------------------------------------------------------ (b) forbidden

{
  const problems = [];
  const forbidden = /donat|drones.for.good|drones-for-good|who makes it|mailto:/gi;
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g;
  // The one email-shaped string allowed: the source's own placeholder, which
  // is not a recipient. It may be written with @ or as &#64;.
  const allowed = /placeholder="you(?:@|&#64;|&commat;)example\.com"/g;
  for (const [f, s] of raw) {
    for (const m of s.matchAll(forbidden)) problems.push(`${f}: "${m[0]}"`);
    const decoded = decode(s.replace(allowed, ''));
    for (const m of decoded.matchAll(email)) problems.push(`${f}: email "${m[0]}"`);
  }
  report('(b) forbidden', problems, 'no donation, Drones for Good, mailto: or email address (placeholder allowlisted)');
}

// ------------------------------------------------------------------ (c) forms

{
  const problems = [];
  for (const [f, { src, doc }] of pages) {
    const forms = byTag(doc, 'form');
    const wantForm = f === 'index.html' || f === 'support.html';
    if (!wantForm) { if (forms.length) problems.push(`${f}: has ${forms.length} <form>, expected none`); continue; }
    if (forms.length !== 1) { problems.push(`${f}: has ${forms.length} <form>, expected 1`); continue; }
    const form = forms[0];
    if (form.attrs.id !== 'contact') problems.push(`${f}: form id is "${form.attrs.id}", expected "contact"`);
    const inlineScripts = byTag(doc, 'script').filter((s) => !s.attrs.src).map(text).join('\n');
    if (form.attrs['data-endpoint'] !== CONFIG.CONTACT_URL && !inlineScripts.includes(CONFIG.CONTACT_URL)) {
      problems.push(`${f}: form does not post to CONTACT_URL`);
    }
    const inputs = byTag(form, 'input');
    const textareas = byTag(form, 'textarea');
    const buttons = byTag(form, 'button');
    const selects = byTag(form, 'select');
    const type = (n) => (n.attrs.type ?? 'text').toLowerCase();
    const one = (pred, what) => {
      const hits = inputs.filter(pred);
      if (hits.length !== 1) problems.push(`${f}: expected one ${what}, found ${hits.length}`);
      return hits[0];
    };
    one((n) => n.attrs.name === 'firstName' && type(n) === 'text', 'input text firstName');
    one((n) => n.attrs.name === 'lastName' && type(n) === 'text', 'input text lastName');
    one((n) => n.attrs.name === 'email' && type(n) === 'email' && n.attrs.placeholder === 'you@example.com', 'input type=email email with placeholder you@example.com');
    const hp = one((n) => n.attrs.name === 'website' && type(n) === 'text', 'input type=text website');
    if (hp) {
      const box = ancestors(hp).find((a) => a.attrs['aria-hidden'] === 'true' && /display\s*:\s*none/i.test(a.attrs.style ?? ''));
      if (!box) problems.push(`${f}: honeypot has no ancestor with aria-hidden="true" and style display:none`);
    }
    if (inputs.length !== 4 || textareas.length !== 1 || selects.length !== 0) {
      problems.push(`${f}: controls are ${inputs.length} input, ${textareas.length} textarea, ${selects.length} select; expected 4, 1, 0`);
    }
    if (textareas.length === 1 && textareas[0].attrs.name !== 'message') problems.push(`${f}: textarea is not name=message`);
    if (buttons.length !== 1 || (buttons[0].attrs.type ?? 'submit') !== 'submit') problems.push(`${f}: expected exactly one submit <button>`);
  }
  report('(c) forms', problems, 'one contact form each in index.html and support.html, none elsewhere, controls as in decision 3');
}

// ------------------------------------------------------------------ (d) external scripts and styles

{
  const problems = [];
  const ok = (u) => (u.startsWith('/') && !u.startsWith('//')) || !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(u) || u.startsWith('https://fonts.googleapis.com/');
  for (const [f, { doc }] of pages) {
    for (const s of byTag(doc, 'script')) if (s.attrs.src !== undefined && !ok(s.attrs.src)) problems.push(`${f}: <script src="${s.attrs.src}">`);
    for (const l of byTag(doc, 'link')) {
      if ((l.attrs.rel ?? '').toLowerCase().split(/\s+/).includes('stylesheet') && !ok(l.attrs.href ?? '')) problems.push(`${f}: stylesheet ${l.attrs.href}`);
    }
  }
  report('(d) external-assets', problems, 'scripts and stylesheets are same-origin or fonts.googleapis.com');
}

// ------------------------------------------------------------------ (e) flags

{
  const problems = [];
  const count = (needle) => [...raw.values()].reduce((n, s) => n + s.split(needle).length - 1, 0);
  if (!CONFIG.LOGIN_ENABLED && count('app.sk8tics.com')) problems.push(`LOGIN_ENABLED is false but app.sk8tics.com appears ${count('app.sk8tics.com')} time(s)`);
  if (CONFIG.LOGIN_ENABLED && !count('app.sk8tics.com')) problems.push('LOGIN_ENABLED is true but no app.sk8tics.com link was built');
  if (!CONFIG.ANDROID_ENABLED) {
    if (count('play.google.com')) problems.push(`ANDROID_ENABLED is false but play.google.com appears ${count('play.google.com')} time(s)`);
    const GP_PAGES = ['support.html', 'privacy.html'];
    for (const [f, s] of raw) {
      const total = s.split('Google Play').length - 1;
      if (!total) continue;
      if (!GP_PAGES.includes(f)) { problems.push(`${f}: "Google Play" appears outside support.html/privacy.html`); continue; }
      const inMain = byTag(pages.get(f).doc, 'main').map(plain).join(' ').split('Google Play').length - 1;
      if (inMain !== total) problems.push(`${f}: "Google Play" appears outside <main>`);
    }
  } else if (!count('play.google.com')) {
    problems.push('ANDROID_ENABLED is true but no play.google.com link was built');
  }
  report('(e) flags', problems, `LOGIN_ENABLED=${CONFIG.LOGIN_ENABLED}, ANDROID_ENABLED=${CONFIG.ANDROID_ENABLED}; links match the flags${CONFIG.ANDROID_ENABLED ? '' : ', "Google Play" only in support.html/privacy.html <main>'}`);
}

// ------------------------------------------------------------------ (f) no Delete account in header or menu

{
  const problems = [];
  for (const [f, { doc }] of pages) {
    const zones = [...byTag(doc, 'header'), ...byTag(doc, 'nav')];
    for (const z of zones) {
      for (const a of byTag(z, 'a')) if (/delete\s*account/i.test(plain(a)) || /delete-account/.test(a.attrs.href ?? '')) problems.push(`${f}: "${plain(a)}" link in <${z.tag}>`);
    }
  }
  report('(f) header-no-delete', problems, 'no Delete account link in any header or nav');
}

// ------------------------------------------------------------------ (g) footer

{
  const problems = [];
  const want = JSON.stringify([['Privacy', '/privacy'], ['Delete account', '/delete-account'], ['Support', '/support']]);
  for (const [f, { doc }] of pages) {
    for (const foot of byTag(doc, 'footer')) {
      const got = JSON.stringify(byTag(foot, 'a').map((a) => [plain(a), a.attrs.href]));
      if (got !== want) problems.push(`${f}: footer links ${got}`);
      if (!plain(foot).includes('©')) problems.push(`${f}: footer has no ©`);
    }
  }
  report('(g) footer', problems, 'every footer is Privacy, Delete account, Support, ©');
}

// ------------------------------------------------------------------ (h) Privacy links

{
  const problems = [];
  for (const [f, { doc }] of pages) {
    for (const a of byTag(doc, 'a')) if (plain(a) === 'Privacy' && !['/privacy', '/privacy.html'].includes(a.attrs.href)) problems.push(`${f}: Privacy → ${a.attrs.href}`);
  }
  report('(h) privacy-links', problems, 'every Privacy link goes to /privacy');
}

// ------------------------------------------------------------------ (i) App Store link

{
  const problems = [];
  const home = pages.get('index.html');
  if (!home) problems.push('no index.html');
  else {
    const links = byTag(home.doc, 'a').filter((a) => (a.attrs.href ?? '').includes('apps.apple.com'));
    if (links.length !== 1) problems.push(`index.html has ${links.length} App Store links, expected 1`);
    for (const a of links) {
      if (a.attrs.href !== CONFIG.APP_STORE_URL) problems.push(`App Store link is ${a.attrs.href}`);
      if (!ancestors(a).some((p) => hasClass(p, 'hero'))) problems.push('App Store link is not inside .hero');
    }
  }
  report('(i) app-store', problems, `one App Store link in the hero (${CONFIG.APP_STORE_URL})`);
}

// ------------------------------------------------------------------ (j) home content

{
  const problems = [];
  const home = pages.get('index.html');
  if (!home) problems.push('no index.html');
  else {
    const cards = all(home.doc, (n) => hasClass(n, 'feature-card'));
    if (cards.length !== 4) problems.push(`${cards.length} .feature-card, expected 4`);
    const sheets = all(home.doc, (n) => hasClass(n, 'sheet')).filter((n) => /DSp3/.test(plain(n)) && /DSpB/.test(plain(n)));
    if (!sheets.length) problems.push('no .sheet containing DSp3 and DSpB');
    if (!byTag(home.doc, 'h2').some((h) => plain(h) === 'Look up scores fast, then compare')) problems.push('no h2 "Look up scores fast, then compare"');
    if (!plain(home.doc).includes('can read it but never change it')) problems.push('missing "can read it but never change it"');
  }
  report('(j) home-content', problems, '4 feature cards, the DSp3→DSpB sheet, the About h2 and the Coaches promise');
}

// ------------------------------------------------------------------ (k) header Contact

{
  const problems = [];
  for (const [f, { doc }] of pages) {
    for (const h of byTag(doc, 'header')) {
      const c = byTag(h, 'a').filter((a) => plain(a) === 'Contact');
      if (c.length !== 1 || c[0].attrs.href !== '/#contact') problems.push(`${f}: header Contact link is ${c.map((a) => a.attrs.href).join(',') || 'missing'}`);
    }
  }
  report('(k) header-contact', problems, 'header Contact → /#contact');
}

// ------------------------------------------------------------------ (l) internal links resolve

{
  const problems = [];
  const external = new Set();
  const ids = new Map([...pages].map(([f, { doc }]) => [f, new Set(all(doc, (n) => n.attrs.id !== undefined).map((n) => n.attrs.id))]));
  for (const [f, { doc }] of pages) {
    const refs = [
      ...byTag(doc, 'a').map((n) => n.attrs.href),
      ...byTag(doc, 'link').filter((n) => !/preconnect|dns-prefetch/i.test(n.attrs.rel ?? '')).map((n) => n.attrs.href),
      ...byTag(doc, 'img').map((n) => n.attrs.src),
      ...byTag(doc, 'script').map((n) => n.attrs.src),
    ].filter((u) => u !== undefined);
    for (const u of refs) {
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(u)) { external.add(u); continue; }
      const [p, hash] = u.split('#');
      let target;
      if (p === '') target = f;
      else {
        let abs = p.startsWith('/') ? p.slice(1) : path.posix.join(path.posix.dirname(f), p);
        if (abs === '' || abs.endsWith('/')) abs += 'index.html';
        if (!raw.has(abs) && raw.has(`${abs}.html`)) abs += '.html';
        if (!raw.has(abs)) { problems.push(`${f}: ${u} → no file`); continue; }
        target = abs;
      }
      if (hash !== undefined && hash !== '') {
        if (!ids.has(target) || !ids.get(target).has(hash)) problems.push(`${f}: ${u} → no id "${hash}" in ${target}`);
      }
    }
  }
  report('(l) links', problems, 'every internal href and src resolves');
  for (const u of [...external].sort()) console.log(`  external (not checked): ${u}`);
}

// ------------------------------------------------------------------ (m) tokens

{
  const problems = [];
  const want = JSON.parse(fs.readFileSync(path.join(HERE, 'source-tokens.json'), 'utf8')).tokens;
  const norm = (o) => new Map(Object.entries(o).map(([k, v]) => [k.trim().toLowerCase(), v.trim().toLowerCase()]));
  const css = [
    ...[...raw].filter(([f]) => f.endsWith('.css')).map(([, s]) => s),
    ...[...pages.values()].flatMap(({ doc }) => byTag(doc, 'style').map(text)),
  ].join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const got = {};
  let roots = 0;
  for (const m of css.matchAll(/(^|[}\s;])(:root)\s*\{([^}]*)\}/g)) {
    roots++;
    for (const d of m[3].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      if (d[1] in got && got[d[1]] !== d[2]) problems.push(`${d[1]} set twice in :root`);
      got[d[1]] = d[2];
    }
  }
  if (!roots) problems.push('no :root rule in the built CSS');
  const a = norm(want), b = norm(got);
  for (const [k, v] of a) if (b.get(k) !== v) problems.push(`${k}: built "${b.get(k) ?? '(missing)'}", source "${v}"`);
  for (const k of b.keys()) if (!a.has(k)) problems.push(`${k}: in built :root, not in source`);
  report('(m) tokens', problems, `${a.size} :root custom properties equal scripts/source-tokens.json`);
}

process.exit(failed ? 1 : 0);
