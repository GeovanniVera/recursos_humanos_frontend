import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FormularioCatalogos } from '../empleados/alta.models';
import { AltaService } from '../empleados/alta.service';
import { FichaService } from '../empleados/ficha.service';
import { BitacoraDetalle } from './bitacora.models';

/**
 * Clave con la que el drawer encuentra la etiqueta de un valor.
 *
 * El campo viaja en la clave porque el mismo identificador puede significar
 * cosas distintas en dos columnas (`id` de área contra `id` de puesto).
 */
export function claveEtiqueta(campo: string, valor: unknown): string {
  return `${campo}:${String(valor)}`;
}

/** Mapa de `campo:valor` a texto legible para los snapshots de la bitácora. */
export type EtiquetasSnapshot = Record<string, string>;

type CatalogoConNombre = { id: number; nombre?: string | null; descripcion?: string | null; clave?: string };

/**
 * Catálogos que el endpoint del formulario puede resolver.
 *
 * La bitácora guarda llaves foráneas en los snapshots; el endpoint del
 * formulario trae las mismas tablas con su descripción. Un solo catálogo se
 * comparte entre todos los movimientos de la sesión.
 */
const CAMPOS_CATALOGO: Record<string, keyof FormularioCatalogos> = {
  area_id: 'areas',
  puesto_id: 'puestos',
  categoria_cct_id: 'categorias_cct',
  nivel_estudios_id: 'niveles_estudios',
  estado_civil_id: 'estados_civiles',
};

const NOMBRES_CAMPO: Record<string, string> = {
  empleado_id: 'Empleado',
  usuario_id: 'Usuario',
  area_id: 'Área',
  puesto_id: 'Puesto',
  categoria_cct_id: 'Categoría',
  nivel_estudios_id: 'Nivel de estudios',
  estado_civil_id: 'Estado civil',
};

@Injectable({ providedIn: 'root' })
export class BitacoraEtiquetasService {
  private readonly alta = inject(AltaService);
  private readonly ficha = inject(FichaService);

  /** Un catálogo por sesión: el drawer se abre muchas veces sobre los mismos IDs. */
  private catalogosEnMemoria$: Observable<FormularioCatalogos | null> | null = null;

  /** Nombres de empleado ya resueltos, para no repetir `GET /empleados/{id}`. */
  private readonly empleadosEnMemoria = new Map<number, string | null>();

  cargar(detalle: BitacoraDetalle): Observable<EtiquetasSnapshot> {
    const valores = this.valoresEn(detalle);
    const idsEmpleado = valores.get('empleado_id') ?? [];
    const hayCatalogos = Object.keys(CAMPOS_CATALOGO).some(
      (campo) => (valores.get(campo)?.length ?? 0) > 0,
    );

    const catalogos$ = hayCatalogos
      ? this.catalogos()
      : of(null as FormularioCatalogos | null);

    const empleados$: Observable<ReadonlyArray<readonly [number, string | null]>> = idsEmpleado.length
      ? forkJoin(
          idsEmpleado.map((id) =>
            this.nombreEmpleado(id).pipe(
              map((nombre) => [id, nombre] as const),
              catchError(() => of([id, null] as const)),
            ),
          ),
        )
      : of([]);

    return forkJoin({ catalogos: catalogos$, empleados: empleados$ }).pipe(
      map(({ catalogos, empleados }) => {
        const etiquetas: EtiquetasSnapshot = {};

        for (const [id, nombre] of empleados) {
          etiquetas[claveEtiqueta('empleado_id', id)] =
            nombre ?? 'Empleado (sin nombre disponible)';
        }

        if (catalogos) {
          for (const [campo, lista] of Object.entries(CAMPOS_CATALOGO)) {
            const filas = catalogos[lista] as CatalogoConNombre[] | undefined;
            for (const id of valores.get(campo) ?? []) {
              const fila = filas?.find((item) => item.id === id);
              if (fila) {
                etiquetas[claveEtiqueta(campo, id)] =
                  fila.nombre ?? fila.descripcion ?? fila.clave ?? this.sinNombre(campo);
              }
            }
          }
        }

        // Un ID que no se pudo resolver no se deja ver como número: se dice que
        // no hay nombre disponible, que es lo que una secretaria puede usar.
        const usuarioActual = detalle.usuario_id;
        if (usuarioActual !== null) {
          etiquetas[claveEtiqueta('usuario_id', usuarioActual)] = detalle.usuario_historico;
        }
        for (const [campo, ids] of valores) {
          for (const id of ids) {
            const clave = claveEtiqueta(campo, id);
            if (etiquetas[clave] === undefined) {
              etiquetas[clave] = this.sinNombre(campo);
            }
          }
        }

        return etiquetas;
      }),
    );
  }

  private sinNombre(campo: string): string {
    return `${NOMBRES_CAMPO[campo] ?? 'Valor'} (sin nombre disponible)`;
  }

  /** IDs numéricos presentes en los dos snapshots, deduplicados por campo. */
  private valoresEn(detalle: BitacoraDetalle): Map<string, number[]> {
    const campos = new Set([...Object.keys(CAMPOS_CATALOGO), 'empleado_id']);
    const encontrados = new Map<string, Set<number>>();

    for (const snapshot of [detalle.datos_antes, detalle.datos_despues]) {
      if (!snapshot) continue;
      for (const [campo, valor] of Object.entries(snapshot)) {
        if (!campos.has(campo)) continue;
        const id = Number(valor);
        if (!Number.isInteger(id) || id < 1) continue;
        const lista = encontrados.get(campo) ?? new Set<number>();
        lista.add(id);
        encontrados.set(campo, lista);
      }
    }

    return new Map([...encontrados].map(([campo, ids]) => [campo, [...ids]]));
  }

  private catalogos(): Observable<FormularioCatalogos | null> {
    this.catalogosEnMemoria$ ??= this.alta.cargarCatalogos().pipe(
      catchError(() => of(null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.catalogosEnMemoria$;
  }

  private nombreEmpleado(id: number): Observable<string | null> {
    if (this.empleadosEnMemoria.has(id)) {
      return of(this.empleadosEnMemoria.get(id) ?? null);
    }

    return this.ficha.consultar(id).pipe(
      map((ficha) => ficha.identificacion.nombre),
      catchError(() => of(null)),
      map((nombre) => {
        this.empleadosEnMemoria.set(id, nombre);
        return nombre;
      }),
    );
  }
}

/** URL expuesta para las pruebas del servicio. */
export const URL_CATALOGOS_FORMULARIO = `${environment.apiBaseUrl}/empleados/formulario`;
