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

test('AC-33 the published site is a complete, self-contained document', () => {
  const SITE = readFileSync(url('docs/index.html'), 'utf8');
  // Unlike app.html, this one must supply its own skeleton.
  assert.match(SITE, /^<!doctype html>/i, 'site must start with a doctype');
  for (const tag of ['<html lang="en">', '<head>', '<body>', '</html>']) {
    assert.ok(SITE.includes(tag), `site is missing ${tag}`);
  }
  assert.match(SITE, /<meta name="viewport" content="width=device-width/, 'no responsive viewport');
  assert.match(SITE, /<meta charset="utf-8">/, 'no charset');
  assert.match(SITE, /<meta name="description" content="[^"]{40,}">/, 'no description for search results');
  assert.match(SITE, /<link rel="icon"/, 'no favicon');
  assert.match(SITE, /color-scheme:light dark/, 'site must honour both themes');

  // It carries the whole app, and stays in step with the artifact build.
  assert.ok(SITE.includes(APP), 'site content has drifted from app.html');
  assert.ok(SITE.includes('const PLAYERS ='), 'ratings table is not inlined into the site');
  assert.ok(SITE.includes('function runTournament'), 'engine is not inlined into the site');

  // Nothing may be fetched from a host the artifact CSP would not allow, so the
  // same file works in both places.
  const refs = [...SITE.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map(m => m[1]);
  for (const r of refs) {
    assert.ok(r.startsWith('https://fonts.googleapis.com'), `unexpected external reference: ${r}`);
  }
  assert.ok(!/<script[^>]+src="(?!https:\/\/cdnjs|https:\/\/cdn\.jsdelivr)/.test(SITE),
    'site must not load scripts from arbitrary hosts');
});

test('AC-34 the site degrades without the Claude runtime', () => {
  const SITE = readFileSync(url('docs/index.html'), 'utf8');
  // `claude` is simply not defined on a plain website, so the lookup must be
  // inside a try/catch — an unguarded reference throws before anything renders.
  const connect = SITE.slice(SITE.indexOf('async function connect()'), SITE.indexOf('/* ── derived'));
  assert.match(connect, /try \{[\s\S]{0,60}claude\.use\('db'\)[\s\S]{0,40}\} catch/,
    'claude.use must be guarded — the identifier does not exist off-platform');
  assert.match(connect, /if \(!cap\)[\s\S]{0,80}render\(\)/, 'a missing runtime must still render');
  assert.match(SITE, /build code/i, 'the offline path must point at build codes');
});
