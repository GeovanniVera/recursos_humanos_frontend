import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { map } from 'rxjs';
import { PaginatedBuffer } from '../pagination/paginated-buffer';
import { EmpleadoPadron } from './padron.models';
import { PadronService } from './padron.service';

/** Rows the user sees per logical page. Matches the backend's default. */
export const PAGINA_LOGICA_PADRON = 20;

/** Maximum block the contract accepts (`por_pagina` <= 100). */
export const BLOQUE_MAX_PADRON = 100;

/** Blocks kept for going back: three windows of 100 records. */
export const BLOQUES_EN_CACHE_PADRON = 3;

/** A block older than this is fetched again. */
export const TTL_BLOQUE_PADRON = 5 * 60 * 1000;

/**
 * Roster store with a two-level window.
 *
 * It is provided by the screen, not at the root: the filter, the page and the
 * cached blocks belong to one visit to the roster. The generic buffer does the
 * caching and the page-to-block math; this store only knows how to ask the
 * endpoint for a block and which filter is applied.
 */
@Injectable()
export class PadronBufferStore {
  private readonly padron = inject(PadronService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly _buscar = signal('');

  private readonly buffer = new PaginatedBuffer<EmpleadoPadron>(
    (pagina, porPagina) =>
      this.padron
        .consultar({ buscar: this._buscar(), pagina, porPagina })
        .pipe(
          map((respuesta) => ({
            items: respuesta.datos,
            pagina: respuesta.meta.pagina,
            porPagina: respuesta.meta.por_pagina,
            total: respuesta.meta.total,
          })),
        ),
    {
      porPagina: PAGINA_LOGICA_PADRON,
      maxPorBloque: BLOQUE_MAX_PADRON,
      maxBloques: BLOQUES_EN_CACHE_PADRON,
      ttlMs: TTL_BLOQUE_PADRON,
    },
  );

  /** Filter the endpoint is currently applying. Empty means "the whole roster". */
  readonly buscar = this._buscar.asReadonly();

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

  /** First load. The page comes from the URL, so a deep link opens where it says. */
  iniciar(pagina = 1): void {
    if (this.iniciado) {
      return;
    }
    this.iniciado = true;
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
