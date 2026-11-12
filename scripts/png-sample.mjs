/**
 * Samples exact pixel colors from a mockup so a background can be matched
 * against real numbers instead of an impression.
 *
 * Usage: node scripts/png-sample.mjs <file.png> x,y [x,y ...]
 */
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [, , file, ...points] = process.argv;

const png = PNG.sync.read(fs.readFileSync(file));

for (const point of points) {
  const [x, y] = point.split(',').map(Number);
  const index = (png.width * y + x) * 4;
  const red = png.data[index];
  const green = png.data[index + 1];
  const blue = png.data[index + 2];
  const alpha = png.data[index + 3];
  const hex = `#${[red, green, blue].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  console.log(`${String(x).padStart(4)},${String(y).padEnd(4)}  ${hex}  rgb(${red},${green},${blue})  a=${alpha}`);
}

console.log(`size ${png.width}x${png.height}`);
