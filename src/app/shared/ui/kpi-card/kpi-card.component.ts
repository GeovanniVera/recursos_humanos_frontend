import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';

/**
 * Meaning of the card, which decides the colour of the flag on its leading
 * edge. It is a semantic role, not a colour name: the theme owns the value.
 */
export type KpiTone = 'success' | 'danger' | 'warning';

/** The three glyphs the card can draw, as inline stroke SVG. */
export type KpiIcon = 'activos' | 'bajas' | 'semaforo';

/**
 * One indicator of a panel.
 *
 * It is generic on purpose: it knows nothing about employees, so any screen can
 * show a counter with it. The value arrives already formatted — the caller owns
 * the locale and the unit — while the component only decides how it is painted.
 *
 * The whole card is a real `<button>` when `clickable` is set, because a
 * clickable `<div>` is unreachable with a keyboard. The flag on the leading
 * edge is a real element instead of a thicker border: a thicker border would
 * widen the box and shift the text when the tone changed.
 */
@Component({
  selector: 'app-kpi-card',
  imports: [NgTemplateOutlet],
  templateUrl: './kpi-card.component.html',
  styleUrl: './kpi-card.component.scss',
})
export class KpiCard {
  /** Name of the metric. */
  readonly label = input.required<string>();
  /** Already formatted figure. `—` when it is not known yet. */
  readonly value = input.required<string>();
  /** State the metric reports, used for the flag. */
  readonly tone = input<KpiTone>('success');
  /** One short line under the value. Omitted, nothing is rendered. */
  readonly hint = input<string>();
  /** Glyph drawn in the top right corner. */
  readonly icon = input.required<KpiIcon>();
  /** Turns the card into a button that opens a layer. */
  readonly clickable = input(false);

  /**
   * Accessible name of the interactive card: the visible `aria-label` would be
   * the label alone, and two cards of the same family would then be
   * indistinguishable to a screen reader.
   */
  protected readonly accessibleName = computed(() => `${this.label()}: ${this.value()}`);

  /** Both the flag and the glyph take the tone from the same class. */
  protected readonly toneClass = computed(() => `is-${this.tone()}`);
}
