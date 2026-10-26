import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldLoadVideo } from '../src/lib/hero-video.mjs';

test('loads video when neither reduced motion nor save-data is asked for', () => {
  assert.equal(shouldLoadVideo({ reducedMotion: false, saveData: false }), true);
});
test('no video when reduced motion is asked for', () => {
  assert.equal(shouldLoadVideo({ reducedMotion: true, saveData: false }), false);
});
test('no video when save-data is on', () => {
  assert.equal(shouldLoadVideo({ reducedMotion: false, saveData: true }), false);
});
test('no video when both are on', () => {
  assert.equal(shouldLoadVideo({ reducedMotion: true, saveData: true }), false);
});
