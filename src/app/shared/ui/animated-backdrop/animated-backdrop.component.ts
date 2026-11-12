import { Component } from '@angular/core';

/**
 * How many particles the backdrop draws. Mirrors the `--backdrop-particles`
 * token: CSS can drive a `@for` loop's length only through markup, so the count
 * is repeated here while the geometry of each particle comes from the
 * `nth-child` rules in the stylesheet.
 */
const PARTICLE_COUNT = 22;

/**
 * Decorative background of the login screen.
 *
 * No JavaScript runs here: every layer is an element that the stylesheet
 * animates with the `--backdrop-*` tokens. It is hidden from the accessibility
 * tree and from the pointer path so the card above it stays fully usable, and
 * it is fixed behind the content of its host screen.
 */
@Component({
  selector: 'app-animated-backdrop',
  templateUrl: './animated-backdrop.component.html',
  styleUrl: './animated-backdrop.component.scss',
  host: { 'aria-hidden': 'true' },
})
export class AnimatedBackdrop {
  /** Stable indices, one per particle. */
  readonly particulas = Array.from({ length: PARTICLE_COUNT }, (_, index) => index);
}
