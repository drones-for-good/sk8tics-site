# sk8tics.com

The public website for [Sk8tics](https://apps.apple.com/app/id6809558326), a
practice log for figure skaters and their coaches.

Four static pages, no build step, no JavaScript:

| File | Purpose |
|---|---|
| `index.html` | What the app is |
| `privacy.html` | Privacy policy — the URL the App Store and Google Play require |
| `support.html` | Support contact and common questions |
| `delete-account.html` | Account deletion, which Google Play requires to be reachable on the web |

Served by GitHub Pages at the domain in `CNAME`. The domain itself is
registered at GoDaddy; only its DNS records point here.

The palette and the typeface pairing come from the app's own `lib/theme.ts`, so
the site and the product read as one thing.

Source of truth for these files is the `web/` folder of the app repository —
edit them there and copy across, so the privacy policy cannot drift from what
the app actually does.
