// Site-wide settings. scripts/check-dist.mjs reads this file too, so keep
// each value on one line in the form `export const NAME = value;`.

// The Supabase function the contact forms post to.
export const CONTACT_URL = 'https://wxracpkhwnohlwfgxlsu.supabase.co/functions/v1/contact';

export const APP_STORE_URL = 'https://apps.apple.com/app/id6809558326';

// Off until the app is out of closed testing on Google Play. While false, no
// badge and no play.google.com link is built anywhere.
export const ANDROID_ENABLED = false;
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.ying.sk8tics';

// Off until the web app at app.sk8tics.com is ready. While false, no
// app.sk8tics.com link is built anywhere.
export const LOGIN_ENABLED = false;
export const APP_URL = 'https://app.sk8tics.com';
export const SIGNUP_URL = 'https://app.sk8tics.com/?mode=signup';
