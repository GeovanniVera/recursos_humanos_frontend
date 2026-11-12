/**
 * Vectorizes the raster institutional logo into a faithful SVG.
 *
 * Usage: node scripts/vectorize-logo.mjs
 *
 * Why not a normal color trace: the default quantizer merges the guinda and
 * the gold because they are close in luminance, and the mark comes out in a
 * single rust tone. The artwork is flat, so the reliable path is to assign
 * every pixel to one of the three real inks and trace three separate masks.
 * Each mask is traced in black and recolored, which keeps the exact palette.
 */
import fs from 'node:fs';
import { PNG } from 'pngjs';
import ImageTracer from 'imagetracerjs';

const SOURCE = 'public/brand_edomex.png';
const TARGET = 'public/brand/logo-edomex.svg';

/** The three inks measured from the source with scripts/png-palette.mjs. */
const INKS = [
  { hex: '#8b1e33', rgb: [139, 30, 51], name: 'guinda' },
  { hex: '#b88e55', rgb: [184, 142, 85], name: 'gold' },
  { hex: '#d7c2a0', rgb: [215, 194, 160], name: 'sand' },
];

const TRACE_OPTIONS = {
  numberofcolors: 2,
  ltres: 0.5,
  qtres: 0.5,
  pathomit: 6,
  rightangleenhance: false,
  strokewidth: 0,
  roundcoords: 2,
  viewbox: true,
  desc: false,
  scale: 1,
};

const png = PNG.sync.read(fs.readFileSync(SOURCE));
const { width, height, data } = png;

const nearestInk = (red, green, blue) => {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  INKS.forEach((ink, index) => {
    const distance =
      (red - ink.rgb[0]) ** 2 + (green - ink.rgb[1]) ** 2 + (blue - ink.rgb[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
};

// One binary mask per ink: black where the pixel belongs to it, white elsewhere.
const masks = INKS.map(() => new Uint8ClampedArray(width * height * 4));
for (let i = 0, p = 0; i < data.length; i += 4, p++) {
  const alpha = data[i + 3] / 255;
  const isInk = alpha >= 0.5;
  const inkIndex = isInk ? nearestInk(data[i], data[i + 1], data[i + 2]) : -1;

  INKS.forEach((_, index) => {
    const value = index === inkIndex ? 0 : 255;
    const offset = p * 4;
    masks[index][offset] = value;
    masks[index][offset + 1] = value;
    masks[index][offset + 2] = value;
    masks[index][offset + 3] = 255;
  });
}

/** Traces one mask and returns only the black paths, recolored. */
const traceMask = (maskData, hex) => {
  const svg = ImageTracer.imagedataToSVG(
    { width, height, data: maskData },
    TRACE_OPTIONS,
  );

  const paths = [...svg.matchAll(/<path\b[^>]*\/>/g)]
    .map((match) => match[0])
    .filter((path) => path.includes('rgb(0,0,0)'))
    .map((path) =>
      path
        .replace(/fill="rgb\(0,0,0\)"/, `fill="${hex}"`)
        .replace(/\s*stroke="[^"]*"/, '')
        .replace(/\s*stroke-width="[^"]*"/, ''),
    );

  return paths;
};

const layers = INKS.map((ink, index) => ({
  hex: ink.hex,
  name: ink.name,
  paths: traceMask(masks[index], ink.hex),
}));

const body = layers
  .map(
    (layer) =>
      `  <g fill="${layer.hex}" data-ink="${layer.name}">\n${layer.paths
        .map((path) => `    ${path}`)
        .join('\n')}\n  </g>`,
  )
  .join('\n');

const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '"',
  '     role="img" aria-label="Gobierno del Estado de México">',
  '  <title>Gobierno del Estado de México</title>',
  body,
  '</svg>',
  '',
].join('\n');

fs.writeFileSync(TARGET, svg, 'utf8');

const total = layers.reduce((sum, layer) => sum + layer.paths.length, 0);
console.log(`written ${TARGET}`);
console.log(`bytes ${svg.length}`);
console.log(`paths ${total}`);
layers.forEach((layer) => console.log(`  ${layer.name}\t${layer.paths.length} paths`));
