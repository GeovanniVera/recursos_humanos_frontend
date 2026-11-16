import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { map, tap } from 'rxjs';
import { PaginatedBuffer } from '../pagination/paginated-buffer';
import { ContadoresEstatus, EmpleadoListadoItem, FiltroEstatus } from './listado.models';
import { EmpleadosListadoService } from './listado.service';

/** Rows the user sees per logical page. Matches the backend's default. */
export const PAGINA_LOGICA_EMPLEADOS = 20;

/** Maximum block the contract accepts (`por_pagina` <= 100). */
export const BLOQUE_MAX_EMPLEADOS = 100;

/** Blocks kept for going back: three windows of 100 records. */
export const BLOQUES_EN_CACHE_EMPLEADOS = 3;

/** A block older than this is fetched again. */
export const TTL_BLOQUE_EMPLEADOS = 5 * 60 * 1000;

/**
 * Listing store with a two-level window.
 *
 * It is provided by the screen, not at the root: the filter, the page and the
 * cached blocks belong to one visit to the listing. The generic buffer does the
 * caching and the page-to-block math; this store only knows how to ask the
 * endpoint for a block, which status is applied and which term is searched.
 *
 * The filter lives here and not in the component because it is part of the
 * request identity: a different status is a different result set, so it drops
 * the cached blocks and the page number exactly like a new search term.
 */
@Injectable()
export class EmpleadosBufferStore {
  private readonly listado = inject(EmpleadosListadoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly _buscar = signal('');
  private readonly _estatus = signal<FiltroEstatus>('activo');
  private readonly _contadores = signal<ContadoresEstatus | null>(null);

  private readonly buffer = new PaginatedBuffer<EmpleadoListadoItem>(
    (pagina, porPagina) =>
      this.listado
        .consultar({
          estatus: this._estatus(),
          buscar: this._buscar(),
          pagina,
          porPagina,
        })
        .pipe(
          // The counters ride with every page: they describe the whole filtered
          // universe, so they are read from the same answer that brings the rows
          // and never need a request of their own.
          tap((respuesta) => this._contadores.set(respuesta.contadores)),
          map((respuesta) => ({
            items: respuesta.datos,
            pagina: respuesta.meta.pagina,
            porPagina: respuesta.meta.por_pagina,
            total: respuesta.meta.total,
          })),
        ),
    {
      porPagina: PAGINA_LOGICA_EMPLEADOS,
      maxPorBloque: BLOQUE_MAX_EMPLEADOS,
      maxBloques: BLOQUES_EN_CACHE_EMPLEADOS,
      ttlMs: TTL_BLOQUE_EMPLEADOS,
    },
  );

  /** Term the endpoint is currently applying. Empty means "the whole listing". */
  readonly buscar = this._buscar.asReadonly();

  /** Status the endpoint is currently applying. */
  readonly estatus = this._estatus.asReadonly();

  /** Figures per status of the filtered universe, or `null` before the first read. */
  readonly contadores = this._contadores.asReadonly();

  readonly pagina = this.buffer.pagina;
  readonly porPagina = this.buffer.porPagina;
  readonly porBloque = this.buffer.porBloque;
  readonly paginasPorBloque = this.buffer.paginasPorBloque;

  readonly filas = this.buffer.filas;
  readonly total = this.buffer.total;
  readonly totalPaginas = this.buffer.totalPaginas;
  readonly desde = this.buffer.desde;
  readonly hasta = this.buffer.hasta;

  readonly hayDatos = this.buffer.hayDatos;
  readonly hayAnterior = this.buffer.hayAnterior;
  readonly haySiguiente = this.buffer.haySiguiente;

  readonly cargandoInicial = this.buffer.cargandoInicial;
  readonly cargandoBloque = this.buffer.cargandoBloque;
  readonly cargando = this.buffer.cargando;
  readonly error = this.buffer.error;
  readonly paginaObjetivo = this.buffer.paginaObjetivo;

  readonly paginaBloque = this.buffer.paginaBloque;
  readonly offsetBloque = this.buffer.offsetBloque;
  readonly offsetPagina = this.buffer.offsetPagina;
  readonly bloquesEnCache = this.buffer.bloquesEnCache;

  private iniciado = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.buffer.destruir());
  }

  /**
   * First load.
   *
   * The page and the status come from the URL, so a deep link opens exactly the
   * list it names. The status is set before the first request because it is part
   * of the query: switching it later would fetch a page nobody asked for.
   */
  iniciar(pagina = 1, estatus: FiltroEstatus = 'activo'): void {
    if (this.iniciado) {
      return;
    }
    this.iniciado = true;
    this._estatus.set(estatus);
    this.buffer.iniciar(pagina);
  }

  /**
   * Applies a search term. A different term is a different result set, so the
   * cached blocks and the page number are dropped.
   */
  aplicarBusqueda(termino: string): void {
    const normalizado = termino.trim();
    if (normalizado === this._buscar()) {
      return;
    }

    this._buscar.set(normalizado);
    this.buffer.reiniciar();
  }

  /**
   * Applies a status filter.
   *
   * Same rule as the search: the filter is part of the request, so switching it
   * throws the cached windows away and starts again at the first page. Pressing
   * the status already applied is a no-op and sends no request.
   */
  aplicarFiltro(estatus: FiltroEstatus): void {
    if (estatus === this._estatus()) {
      return;
    }

    this._estatus.set(estatus);
    this.buffer.reiniciar();
  }

  irAPagina(pagina: number): void {
    this.buffer.irAPagina(pagina);
  }

  primera(): void {
    this.buffer.primera();
  }

  ultima(): void {
    this.buffer.ultima();
  }

  cambiarPorPagina(porPagina: number): void {
    this.buffer.cambiarPorPagina(porPagina);
  }

  /** Refetches the current block, keeping its rows while it loads. */
  recargar(): void {
    this.buffer.recargar();
  }

  /** Retries the block that failed, not the page that stayed on screen. */
  reintentar(): void {
    this.buffer.reintentar();
  }
}
