import { Component, input, model, output } from '@angular/core';
import { NivelEstudiosCatalogo } from '../../../core/empleados/alta.models';
import { GradoAcademico } from '../../../core/empleados/ficha.models';
export type GradoPresentacion = Omit<GradoAcademico, 'id'> & { clave: string; id?: number };
@Component({
  selector: 'app-grados-academicos',
  templateUrl: './grados-academicos.component.html',
  styleUrl: './grados-academicos.component.scss',
})
export class GradosAcademicos {
  readonly prefijo = input.required<string>();
  readonly grados = input<readonly GradoPresentacion[]>([]);
  readonly niveles = input<readonly NivelEstudiosCatalogo[]>([]);
  readonly gradoAbierto = input(false);
  readonly editando = input(false);
  readonly guardandoGrado = input(false);
  readonly gradoErrores = input<Record<string, string[]>>({});
  readonly erroresRegistros = input<Record<string, string[]>>({});
  readonly gradoNivel = model<number | null>(null);
  readonly gradoTitulo = model<string>('');
  readonly gradoEscuela = model<string>('');
  readonly gradoGeneracion = model<string>('');
  readonly gradoCedula = model<string>('');
  readonly gradoMaximo = model<boolean>(false);
  readonly nuevoGrado = output<void>();
  readonly cancelarGrado = output<void>();
  readonly guardarGrado = output<void>();
  readonly editarGrado = output<GradoPresentacion>();
  readonly eliminarGrado = output<GradoPresentacion>();
  readonly marcarGradoMaximo = output<GradoPresentacion>();
  errorGrado(campo: string): string | null {
    return this.gradoErrores()[campo]?.join(' ') || null;
  }
}
