import { Component, input, output } from '@angular/core';

/** One row of the recap: what the sheet calls the field, and what it will send. */
export interface FilaResumen {
  readonly etiqueta: string;
  readonly valor: string;
}

/** One block of the recap, one per section of the form. */
export interface GrupoResumen {
  readonly titulo: string;
  readonly filas: readonly FilaResumen[];
}

/**
 * The `Revisión` sheet: the recap of the draft and the act that sends it.
 *
 * It is its own component for the same two reasons the record's annex is: the
 * folder's stylesheet does not fit the recap in its 7 kB budget, and this sheet
 * is a different document anyway — a closing page that only reads and then acts.
 *
 * It is a view and nothing else. It does not know the draft, the rules or the
 * service: the recap arrives already formatted, and pressing the button only
 * says that the operator asked to register. The drawer owns the validation, the
 * request, the jump to the first field that failed and the way out.
 */
@Component({
  selector: 'app-alta-revision',
  templateUrl: './alta-revision.component.html',
  styleUrl: './alta-revision.component.scss',
})
export class AltaRevision {
  /** Recap of everything typed, grouped by section. */
  readonly resumen = input.required<readonly GrupoResumen[]>();

  /** `true` while the registration is in flight. */
  readonly enviando = input(false);

  /** The operator pressed the one action of the sheet. */
  readonly registrar = output<void>();
}
