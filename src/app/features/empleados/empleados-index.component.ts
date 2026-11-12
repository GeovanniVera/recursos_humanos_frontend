import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** One destination of the branch. */
interface Seccion {
  readonly titulo: string;
  readonly descripcion: string;
  readonly ruta: string;
  readonly tono: 'success' | 'danger' | 'warning';
  readonly icono: 'activos' | 'bajas' | 'semaforo';
}

/**
 * Landing page of the employees branch, reachable at `/empleados`.
 *
 * It is an index and nothing else: it names the sections and leads to them. The
 * listings live in their own screens — the roster is `/empleados/activos`,
 * because the backend query already filters by state and a combined list would
 * misrepresent both.
 */
@Component({
  selector: 'app-empleados-index',
  imports: [RouterLink],
  templateUrl: './empleados-index.component.html',
  styleUrl: './empleados-index.component.scss',
})
export class EmpleadosIndex {
  /** Sections of the branch, in the order they are presented. */
  readonly secciones: readonly Seccion[] = [
    {
      titulo: 'Empleados activos',
      descripcion: 'La plantilla vigente, con búsqueda y paginación sobre el listado real.',
      ruta: '/empleados/activos',
      tono: 'success',
      icono: 'activos',
    },
    {
      titulo: 'Empleados baja',
      descripcion: 'Las bajas de personal, con su fecha, su motivo y el archivo histórico.',
      ruta: '/empleados/baja',
      tono: 'danger',
      icono: 'bajas',
    },
    {
      titulo: 'Semáforo de documentos',
      descripcion: 'El estado de cada expediente, con sus faltantes y sus vencimientos.',
      ruta: '/semaforo-documentos',
      tono: 'warning',
      icono: 'semaforo',
    },
  ];
}
