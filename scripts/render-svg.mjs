/**
 * Renders an SVG to PNG so the traced result can be compared against the
 * original raster by eye. Verification tool, not part of the app build.
 *
 * Usage: node scripts/render-svg.mjs <input.svg> <output.png> [width]
 */
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const [, , input, output, widthArg] = process.argv;
const width = Number(widthArg ?? 1472);

const resvg = new Resvg(fs.readFileSync(input), {
  fitTo: { mode: 'width', value: width },
  background: 'white',
});

fs.writeFileSync(output, resvg.render().asPng());
console.log(`rendered ${output}`);
