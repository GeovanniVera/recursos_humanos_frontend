/**
 * Prints the dominant colors of a PNG, so a trace can be built against the
 * real palette instead of letting a quantizer guess it.
 *
 * Usage: node scripts/png-palette.mjs <file.png> [topN]
 */
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [, , file, topArg] = process.argv;
const top = Number(topArg ?? 10);

const png = PNG.sync.read(fs.readFileSync(file));
const counts = new Map();

for (let i = 0; i < png.data.length; i += 4) {
  const alpha = png.data[i + 3] / 255;
  if (alpha < 0.5) {
    continue; // ignore the transparent background
  }
  const red = png.data[i];
  const green = png.data[i + 1];
  const blue = png.data[i + 2];
  const key = `${red},${green},${blue}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);

for (const [key, count] of sorted) {
  const [red, green, blue] = key.split(',').map(Number);
  const hex = `#${[red, green, blue].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  console.log(`${hex}  rgb(${red},${green},${blue})  ${(count / total * 100).toFixed(2)}%`);
}
console.log(`unique colors: ${counts.size}`);
