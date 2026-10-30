import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const assets = ['assets/styles.css', 'assets/main.js', 'assets/publications.js'];
const versions = Object.fromEntries(await Promise.all(assets.map(async (asset) => [
  asset,
  createHash('sha256').update(await readFile(new URL(asset, root))).digest('hex').slice(0, 12),
])));

for (const page of ['index.html', 'research.html', 'projects.html']) {
  const file = new URL(page, root);
  const html = await readFile(file, 'utf8');
  const versioned = html.replace(
    /((?:href|src)=["'])(assets\/(?:styles\.css|main\.js|publications\.js))(?:\?[^"']*)?(["'])/g,
    (_, prefix, asset, quote) => `${prefix}${asset}?v=${versions[asset]}${quote}`,
  );
  if (versioned !== html) await writeFile(file, versioned);
}

console.log('Updated shared stylesheet and script versions on all three pages.');
