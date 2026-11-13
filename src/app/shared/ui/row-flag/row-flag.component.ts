import { Component, computed, input } from '@angular/core';

/**
 * Meaning of the flag, which decides the colour of the lane on the leading edge
 * of the row. It is a semantic role of this system, not a colour name: the theme
 * owns the value.
 */
export type RowFlagTone = 'completo' | 'casi_completo' | 'incompleto' | 'activo' | 'baja';

/**
 * State flag painted on the leading edge of a table row.
 *
 * The screen reader gets the sentence in `label`; the lane itself is decoration,
 * so the state never depends on colour alone.
 *
 * Precondition — the host cell must be positioned. The lane is absolute, so it
 * is pinned to the nearest positioned ancestor; without one it would be pinned
 * to the viewport and land on the wrong place of the screen. Inside `app-data-table`
 * that ancestor only exists when the table is rendered with
 * `[leadingDecoration]="true"`, which makes the first body cell `position: relative`.
 * A caller that forgets the input gets a lane outside the table.
 *
 * The component renders no box of its own: the host stays an inline element with
 * two absolute children, so it never adds width or height to the cell's content
 * and the text does not move when the tone changes.
 */
@Component({
  selector: 'app-row-flag',
  template: `
    <span class="row-flag" [class]="'row-flag ' + toneClass()" aria-hidden="true"></span>
    <span class="visually-hidden">{{ label() }}</span>
  `,
  styleUrl: './row-flag.component.scss',
})
export class RowFlag {
  /** State the row reports, used for the lane colour. */
  readonly tone = input.required<RowFlagTone>();

  /**
   * Sentence a screen reader announces, e.g. `Estado del expediente: Completo`.
   * It carries both the subject and the value, because the flag alone has no name.
   */
  readonly label = input.required<string>();

  /** One class per tone, with the domain's underscores spelled as kebab-case. */
  protected readonly toneClass = computed(() => `is-${this.tone().replaceAll('_', '-')}`);
}
