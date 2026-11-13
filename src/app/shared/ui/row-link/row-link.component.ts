import { Component, input } from '@angular/core';

/**
 * The name of a row, painted as text and behaving as a real button.
 *
 * Every table of the system needs the same thing: a 44 px target inside a cell
 * that already has the pointer shortcut of the row. The row click is a pointer
 * convenience; the keyboard needs an element that already is a control, and a
 * `<tr>` cannot become one without lying to assistive tech about what it is.
 *
 * The component owns the box, the target and the focus ring, so two tables
 * cannot give the same action two different heights. The word is projected; a
 * caller that needs a sentence instead of the bare name passes `ariaLabel`.
 */
@Component({
  selector: 'app-row-link',
  template: `<button type="button" class="row-link" [attr.aria-label]="ariaLabel()">
    <ng-content />
  </button>`,
  styleUrl: './row-link.component.scss',
})
export class RowLink {
  /**
   * Sentence a screen reader announces, e.g. `Ver la ficha de Ana Prueba`.
   * Optional: a button whose own text is the whole name needs no second label.
   */
  readonly ariaLabel = input<string | null>(null);
}
