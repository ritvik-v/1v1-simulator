import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const url = p => new URL('../' + p, import.meta.url);
execFileSync(process.execPath, [new URL('../tools/build.js', import.meta.url).pathname]);
const APP = readFileSync(url('app.html'), 'utf8');

test('AC-16 the build inlines the ratings table and the engine, with no stray external code', () => {
  assert.ok(APP.includes('const PLAYERS ='), 'ratings table is not inlined');
  for (const fn of ['function simulateGame', 'function simulateSeries', 'function runTournament',
                    'function costOf', 'function validateBuild', 'function toFighter']) {
    assert.ok(APP.includes(fn), `engine is missing ${fn}`);
  }
  assert.ok(!APP.includes('/*__BUNDLE__*/'), 'bundle marker survived the build');
  assert.ok(!/\bimport\s+\{/.test(APP), 'module import syntax leaked into the page');
  assert.ok(!/^export /m.test(APP), 'module export syntax leaked into the page');

  const ALLOWED = ['https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net/npm/',
                   'https://cdn.tailwindcss.com', 'https://code.jquery.com',
                   'https://fonts.googleapis.com'];
  const refs = [...APP.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map(m => m[1]);
  for (const r of refs) {
    assert.ok(ALLOWED.some(a => r.startsWith(a)), `"${r}" is not on the Artifact CSP allowlist`);
  }
  assert.ok(refs.length >= 1, 'expected the Google Fonts stylesheet');
});

test('AC-17 the page is body content only, as the Artifact runtime requires', () => {
  for (const tag of ['!doctype', 'html', 'head', 'body']) {
    const re = new RegExp('<\\s*/?\\s*' + tag + '(?=[\\s>/])', 'i');
    assert.ok(!re.test(APP), `app.html contains a <${tag}> tag`);
  }
  assert.match(APP, /^<title>[^<]+<\/title>/, 'page must open with its title');
  assert.ok(statSync(url('app.html')).size < 16 * 1024 * 1024, 'page exceeds the 16 MB artifact limit');
});

test('AC-18 the page renders and explains itself when db is unavailable', () => {
  // Every db reach goes through claude.use, whose null result must be handled.
  assert.match(APP, /claude\.use\('db'\)/, 'db capability is never requested');
  assert.match(APP, /if \(!cap\)[\s\S]{0,80}render\(\)/,
    'a null db capability must still render the page');
  assert.match(APP, /Not synced/i, 'no explanation is shown when sync is unavailable');
  // Local storage is the fallback, and every access is guarded.
  const lsCalls = [...APP.matchAll(/localStorage\.(getItem|setItem)/g)].length;
  assert.ok(lsCalls >= 2, 'expected a localStorage fallback');
  assert.match(APP, /try \{[^}]*localStorage\.getItem/, 'localStorage reads must be guarded');
  assert.match(APP, /try \{[^}]*localStorage\.setItem/, 'localStorage writes must be guarded');
});

test('AC-19 the league screen gates rival builds behind the full-league reveal', () => {
  // The rendered build detail is reachable only when every manager has locked,
  // or when the build is the viewer's own.
  assert.match(APP, /const total = managers\(\)\.length, n = lockedList\(\)\.length, reveal = n === total;/,
    'reveal is not derived from a full set of locks');
  assert.match(APP, /\(reveal \|\| mine\) && b && b\.picks\s*\n?\s*\? buildDl\(b\)/,
    'build detail is not gated on reveal');
  assert.match(APP, /Locked and hidden until the reveal/, 'no placeholder for a hidden build');
  // buildDl is the only thing that renders player names into a manager card,
  // and it is called from exactly one place (the declaration is not a call).
  const calls = [...APP.matchAll(/(?<!function )buildDl\(b\)(?!\s*\{)/g)].length;
  assert.equal(calls, 1,
    `build detail is rendered from ${calls} places — the gate can be bypassed`);
});

test('the page declares the five slots and the cap it actually enforces', () => {
  for (const label of ['Shot Creation', 'Handles', 'Frame', 'Defense', 'Athleticism']) {
    assert.ok(APP.includes(label), `slot "${label}" is missing from the page`);
  }
  assert.ok(APP.includes('const BUDGET = 750'), 'the cap is not inlined');
});
