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
  demodule(read('src/scout.js')),
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

// ── docs/index.html: the same page as a standalone site ─────────────────────
// GitHub Pages serves a real document, so this build supplies the skeleton the
// Artifact runtime would otherwise wrap around it — plus the same small reset,
// so the page lays out identically in both places.
const DESCRIPTION =
  'Build a 1v1 basketball player from five real NBA attributes under a salary cap, '
  + 'then find out how it holds up — or run a twelve-manager tournament for fantasy draft order.';

const site = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${DESCRIPTION}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#E8EAE6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101413" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="Blacktop Draft">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">\u{1F3C0}</text></svg>')}">
<style>
  :root{color-scheme:light dark}
  body{margin:0;font:14px system-ui,sans-serif;background:#E8EAE6}
  img{max-width:100%}
  [hidden]{display:none!important}
</style>
</head>
<body>
${out}
</body>
</html>
`;
writeFileSync(here('docs/index.html'), site);
writeFileSync(here('docs/.nojekyll'), '');
console.log(`docs/index.html — ${(site.length / 1024).toFixed(1)} KB standalone site`);
