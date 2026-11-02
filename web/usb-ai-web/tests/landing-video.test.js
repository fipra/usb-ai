import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
const translations = readFileSync(new URL('../../../landing-i18n.js', import.meta.url), 'utf8');

test('the selected video is embedded with a responsive, labelled player', () => {
  const iframe = html.match(/<iframe\b[^>]*>/g) || [];
  assert.equal(iframe.length, 1);
  assert.match(iframe[0], /src="https:\/\/www\.youtube-nocookie\.com\/embed\/mmns33BsBcY"/);
  assert.match(iframe[0], /title="[^"]+"/);
  assert.match(iframe[0], /loading="lazy"/);
  assert.doesNotMatch(iframe[0], /autoplay=1/);
  assert.match(html, /\.video-player\{[^}]*aspect-ratio:16\/9/);
  assert.match(html, /href="\/nuovo-web\/"/);
});

test('the video card text is included in landing translations', () => {
  for (const label of ['Il video del giorno', 'Cos’è la quantizzazione?', 'Video in inglese']) {
    assert.ok(html.includes(label));
    assert.ok(translations.includes(`"${label}"`));
  }
});
