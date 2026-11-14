import { Component, computed, input, signal } from '@angular/core';

/**
 * Institutional logos of the UTN and of the Government of the State of Mexico.
 *
 * Both slots are white boxes, always, in every theme. The real artwork lives in
 * `public/brand/` — Angular 22 serves `public/` as the asset root, so the old
 * `src/assets/brand/` path from AGENTS.md does not apply to this workspace.
 *
 * If a file is missing the slot falls back to the dashed placeholder instead of
 * showing a broken image, so the absence is visible rather than silent.
 * No screen places logos on its own: every screen uses this component.
 */
@Component({
  selector: 'app-brand-logos',
  templateUrl: './brand-logos.component.html',
  styleUrl: './brand-logos.component.scss',
})
export class BrandLogos {
  /**
   * Slot size: `sm` for the sidebar, `lg` for the login header.
   *
   * `mark` is the emblem alone — the UTN shield without the state wordmark and
   * without the caption. It exists for the 76px rail of the drawer, where the
   * two marks cannot sit side by side and an empty head would read as a broken
   * panel. The square artwork is the one that fits a square slot.
   */
  readonly variant = input<'sm' | 'lg' | 'mark'>('sm');

  /** `true` when only the institutional emblem is rendered. */
  protected readonly isMark = computed(() => this.variant() === 'mark');

  /** Renders the "Sistema de Recursos Humanos" caption under the slots. */
  readonly showCaption = input(false);

  /**
   * Wraps each logo in a white plate. On by default because the official marks
   * assume a white field and the login sits over a coloured backdrop. The
   * sidebar turns it off: the glass rail already provides the surface.
   */
  readonly plated = input(true);

  /** Served from `public/brand/`. */
  protected readonly utnSrc = 'brand/logo-utn.svg';
  protected readonly edomexSrc = 'brand/logo-edomex.svg';

  /** Flipped by the image `error` event, which falls back to the placeholder. */
  protected readonly utnFailed = signal(false);
  protected readonly edomexFailed = signal(false);
}
