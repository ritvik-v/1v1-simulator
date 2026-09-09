// Inline the engine and the ratings table into a single publishable page.
// The Artifact runtime wraps the file in its own document skeleton, so what we
// emit is body content only — no doctype, html, head or body tags.
import { readFileSync, writeFileSync } from 'node:fs';

const here = p => new URL('../' + p, import.meta.url);
const read = p => readFileSync(here(p), 'utf8');

// Strip module syntax so the sources can share one <script> scope in the browser.
const demodule = src => src
  .replace(/^\s*import[^;]*;\s*$/gm, '')
  .replace(/^export\s+(const|function|class|let)\b/gm, '$1')
  .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');

const players = JSON.parse(read('data/players.json'));
const bundle = [
  `const PLAYERS = ${JSON.stringify(players)};`,
  demodule(read('src/ratings.js')),
  demodule(read('src/sim.js')),
  demodule(read('src/tournament.js')),
].join('\n\n');

const out = read('web/app.template.html').replace('/*__BUNDLE__*/', () => bundle);

// Match real tags only: <head> and <head ...>, never <header>.
for (const tag of ['!doctype', 'html', 'head', 'body']) {
  const re = new RegExp('<\\s*/?\\s*' + tag + '(?=[\\s>/])', 'i');
  if (re.test(out)) {
    throw new Error(`app.html must not contain a <${tag}> tag — the Artifact runtime supplies it`);
  }
}
if (out.includes('/*__BUNDLE__*/')) throw new Error('bundle marker was not replaced');

writeFileSync(here('app.html'), out);
console.log(`app.html — ${(out.length / 1024).toFixed(1)} KB, ${players.players.length} players inlined`);
