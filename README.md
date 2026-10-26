# sk8tics.com

The public website for [Sk8tics](https://apps.apple.com/app/id6809558326), a
practice log for figure skaters and their coaches.

> **Branch `dro-102-astro`: do not merge into `main`.**
> GitHub Pages serves `main` from the repository root. This branch has no
> `index.html` at the root (the site is built into `dist/`), so merging it
> would take sk8tics.com down. It must not be merged until the hosting switch
> (Cloudflare Pages building `dist/`) and the contact-function deploy are done
> under their own issues.

## What it is

A static [Astro](https://astro.build) site with no UI framework and no
server-side code. It builds four pages:

| URL | Source | Purpose |
|---|---|---|
| `/` | `src/pages/index.astro` | What the app is: video hero, four features, who it's for, screens, about, contact form |
| `/support` | `src/pages/support.astro` | Common questions and the contact form (the App Store Support URL) |
| `/privacy` | `src/pages/privacy.astro` | Privacy policy, the URL the App Store and Google Play require |
| `/delete-account` | `src/pages/delete-account.astro` | Account deletion, which Google Play requires to be reachable on the web |

`build.format: 'file'` writes `dist/support.html` and so on, so both `/support`
and the old `/support.html` keep working.

The privacy, delete-account and support text was ported from the app
repository at skatelog-web commit `8e7af91` (branch
`daniel/dro-86-landing-page`), and only the links changed. This repository is
now where the site is edited; do not copy pages in from the app repo.
`scripts/check-dist.mjs --source` shows whether the text still matches that
commit.

The palette and type pairing come from the app's own `lib/theme.ts`.
`scripts/source-tokens.json` is a snapshot of the 15 `:root` tokens at
`8e7af91`, and `npm run check` fails if the built CSS drifts from it.

## Settings

`src/config.ts` holds the contact endpoint, the store URLs and two flags:

- `ANDROID_ENABLED`: off. While it is off there is no Google Play badge and no
  `play.google.com` link anywhere.
- `LOGIN_ENABLED`: off. While it is off there is no `app.sk8tics.com` link.

The contact form (`src/components/ContactForm.astro`, on `/` and `/support`)
posts to the Supabase `contact` function. Until that function is deployed,
every submission shows the "Sorry, that didn't send" message.

## Hero video

`public/video/hero-poster.jpg` is a placeholder. The video itself
(`public/video/hero.webm` and `hero.mp4`) is not committed yet. Without it, the
hero shows the poster, or the plain dark background if there is no poster
either. Visitors who ask for reduced motion or Save-Data never download the
video (`src/lib/hero-video.mjs`).

## Working on it

```sh
cd /Users/danielying/Documents/skating/sk8tics-site
npm ci
npm run dev                      # http://localhost:4321
npm run build                    # writes dist/
npm run check                    # checks dist/ (run after build)
npm run check:selftest           # plants one fault per check and makes sure each is caught
npm test                         # node:test for the hero video decision
npx astro preview --port 4321    # serves dist/ as built
```

Run `npm run build && npm run check && npm run check:selftest` before opening a
pull request.
