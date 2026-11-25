/**
 * Flat rendering of the organization chart.
 *
 * `GET /api/empleados/formulario` and `GET /api/catalogos/areas` both send the
 * chart as a forest: a list of nodes with `padre_id`, never nested objects, and
 * with several roots. The order of the payload is not usable either — `orden`
 * ties at 0 for most rows — so the traversal has to sort siblings by name to be
 * stable between calls.
 *
 * Both screens need the same answer ("which node, at which depth"), one for a
 * `<select>` and one for a table, so the walk lives here once instead of being
 * copied with a different indent character.
 */

/** The only three fields the walk reads. Any area shape satisfies it. */
export interface AreaNodo {
  readonly id: number;
  readonly padre_id: number | null;
  readonly nombre: string;
}

/** A node and its distance from its root. Roots sit at `0`. */
export interface AreaUbicada<T extends AreaNodo> {
  readonly area: T;
  readonly depth: number;
}

/** Locale of the sibling sort: the chart is Spanish. */
const IDIOMA = 'es';

/**
 * Walks the forest depth first and returns every node once, roots first.
 *
 * Two payload defects are survived instead of trusted: a `padre_id` that points
 * at a row missing from the list is treated as a root (the node must still be
 * reachable), and a cycle is cut by the visited set (a broken chart must not
 * hang the screen). Anything the walk could not reach is appended at depth `0`,
 * so no row ever disappears.
 */
export function flattenAreaTree<T extends AreaNodo>(
  areas: readonly T[],
): readonly AreaUbicada<T>[] {
  if (areas.length === 0) {
    return [];
  }

  const porId = new Map<number, T>(areas.map((area) => [area.id, area]));

  const hijos = new Map<number | null, T[]>();
  for (const area of areas) {
    const padre = area.padre_id !== null && porId.has(area.padre_id) ? area.padre_id : null;
    const grupo = hijos.get(padre) ?? [];
    grupo.push(area);
    hijos.set(padre, grupo);
  }

  const porNombre = (grupo: readonly T[]): T[] =>
    [...grupo].sort((a, b) => a.nombre.localeCompare(b.nombre, IDIOMA));

  const salida: AreaUbicada<T>[] = [];
  const visitadas = new Set<number>();

  const recorrer = (padre: number | null, depth: number): void => {
    for (const area of porNombre(hijos.get(padre) ?? [])) {
      if (visitadas.has(area.id)) {
        continue;
      }
      visitadas.add(area.id);
      salida.push({ area, depth });
      recorrer(area.id, depth + 1);
    }
  };

  recorrer(null, 0);

  for (const area of porNombre(areas.filter((item) => !visitadas.has(item.id)))) {
    salida.push({ area, depth: 0 });
  }

  return salida;
}
