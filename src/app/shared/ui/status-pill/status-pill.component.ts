import { Component, ViewEncapsulation, computed, input } from '@angular/core';

/**
 * State a pill can report.
 *
 * The values are domain roles, not colours: the theme owns the value. The file
 * state keeps the backend's underscore (`casi_completo`), and the class is the
 * kebab-case spelling of it.
 */
export type StatusPillTone = 'completo' | 'casi_completo' | 'incompleto' | 'activo' | 'baja';

/**
 * Labelled state of a record: a pill with the word inside.
 *
 * The component owns the shape and the palette of every state of the system, so
 * a table, a drawer and a badge cannot drift apart. The word is projected by the
 * caller, and so is the icon: a feature that draws its own marker keeps the
 * drawing, while the pill decides its size, its place and its ink.
 *
 * `casi_completo` is outlined rather than filled: the solid warning fill with
 * white ink measured 4.24:1, so the yellow marker moved to the border and to the
 * icon and the word kept the primary ink.
 *
 * This component opts out of emulated encapsulation on purpose. Angular stamps
 * the *caller's* scope attribute on a projected node, so an emulated rule of this
 * stylesheet could never reach the projected icon; keeping the view unstyled
 * would hand the size and the ink of the marker back to every feature, which is
 * the duplication this component exists to remove. Scoping every rule under the
 * element selector keeps the reach as narrow as an emulated class would be.
 */
@Component({
  selector: 'app-status-pill',
  template: `<span [class]="'pill ' + toneClass()"><ng-content /></span>`,
  styleUrl: './status-pill.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class StatusPill {
  /** State the pill reports, which decides its tone. */
  readonly estado = input.required<StatusPillTone>();

  /** One class per tone, with the domain's underscore spelled as kebab-case. */
  protected readonly toneClass = computed(() => `is-${this.estado().replaceAll('_', '-')}`);
}
