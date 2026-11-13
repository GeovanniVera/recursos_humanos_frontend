import { Component, computed, input, output } from '@angular/core';
import { CatalogoDiagnostico } from '../../../../core/catalogos/catalogos.models';

/** The findings of the post table this banner can narrow. */
export type HallazgoPuesto = 'sin-area' | 'sin-empleados' | 'contradiccion';

/**
 * Diagnostics of the catalogs, above the tabs.
 *
 * Presentational on purpose: it reads the answer of `GET /catalogos/diagnostico`
 * and reports which finding the operator asked to review, but it owns no data and
 * makes no requests. The screen decides where each review leads, because only the
 * screen knows which tab holds the rows.
 *
 * The two faces are told apart by `role`: good news is a `status`, something to
 * review is an `alert`.
 */
@Component({
  selector: 'app-diagnostico-banner',
  templateUrl: './diagnostico-banner.component.html',
  styleUrl: './diagnostico-banner.component.scss',
})
export class DiagnosticoBanner {
  readonly diagnostico = input<CatalogoDiagnostico | null>(null);

  /** A finding of the post table was asked to be reviewed. */
  readonly revisarPuestos = output<HallazgoPuesto>();

  /** The category finding has no rows in the post table, so it only opens its tab. */
  readonly revisarCategorias = output<void>();

  /**
   * `true` when every counter is zero and the classification list is empty.
   *
   * A counter at `0` means "nothing to review", which is the good answer, so all
   * of them have to be zero and the list empty for the strip to turn green.
   */
  readonly sinHallazgos = computed(() => {
    const diagnostico = this.diagnostico();
    if (diagnostico === null) {
      return false;
    }

    return (
      diagnostico.puestos_sin_area === 0 &&
      diagnostico.puestos_sin_empleados === 0 &&
      diagnostico.categorias_sin_uso === 0 &&
      diagnostico.empleados_sin_area === 0 &&
      diagnostico.puestos_con_clasificacion_contradicha.length === 0
    );
  });

  /** Figure of a counter, grouped like every other number of the screen. */
  private readonly formato = new Intl.NumberFormat('es-MX');

  /** Sentence of a counter, singular or plural. */
  protected contador(total: number, singular: string, plural: string): string {
    return `${this.formato.format(total)} ${total === 1 ? singular : plural}`;
  }
}
