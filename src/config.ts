// Site-wide settings. scripts/check-dist.mjs reads this file too, so keep
// each value on one line in the form `export const NAME = value;`.

// The Supabase function the contact forms post to.
export const CONTACT_URL = 'https://wxracpkhwnohlwfgxlsu.supabase.co/functions/v1/contact';

export const APP_STORE_URL = 'https://apps.apple.com/app/id6809558326';

// Off until the app is out of closed testing on Google Play. While false, no
// badge and no play.google.com link is built anywhere.
export const ANDROID_ENABLED = false;
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.ying.sk8tics';

// On: every page header shows one "Log in / Sign up" button in its top-right
// corner, linking to APP_URL (the web app's sign-in screen, which also offers
// "Create account"). Set it to false to build no app.sk8tics.com link
// anywhere; the phone scroll-margin in src/styles/site.css is sized for the
// two-row phone header this flag makes.
export const LOGIN_ENABLED = true;
export const APP_URL = 'https://app.sk8tics.com/';
