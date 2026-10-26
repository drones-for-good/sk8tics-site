// Whether the hero should fetch its background video at all. Kept pure so it
// can be tested with node:test (scripts/hero-video.test.mjs) without a browser.
// A visitor who asked for reduced motion, or for reduced data use, gets the
// poster (or the plain dark ground) and never downloads the video.
export function shouldLoadVideo({ reducedMotion, saveData }) {
  return reducedMotion === false && saveData === false;
}
