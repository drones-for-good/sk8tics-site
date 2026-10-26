// @ts-check
import { defineConfig } from 'astro/config';

// build.format 'file' writes dist/support.html rather than dist/support/index.html,
// so the old /support.html URLs keep working next to /support.
// cssMinify is off so scripts/check-dist.mjs can read the built :root tokens
// and compare them with scripts/source-tokens.json.
// compressHTML is off because it drops a newline that sits between an inline
// closing tag and the next word ("<em>your username</em>\n to confirm" became
// "usernameto confirm"), which changes the approved privacy and support text.
export default defineConfig({
  site: 'https://sk8tics.com',
  compressHTML: false,
  build: { format: 'file' },
  vite: { build: { cssMinify: false } },
});
