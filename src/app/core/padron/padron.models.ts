/**
 * Pagination envelope shared by the endpoints that answer page by page.
 *
 * The employee listing and the record's edit flow speak `GET /api/empleados`,
 * which ships its own `listado.models.ts`; the traffic light keeps reading the
 * same two blocks this module declares. They stay here, in one file, because
 * three screens must count and link pages the same way.
 */

/** Counters of the page that was served. */
export interface PadronMeta {
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

/**
 * Neighbour links of the page. Absolute URLs built by the backend; kept because
 * they belong to the contract, not used to navigate: the screens request pages
 * by number so the query they send never depends on a URL they did not build.
 */
export interface PadronEnlaces {
  anterior: string | null;
  siguiente: string | null;
}
