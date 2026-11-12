import { computed, signal } from '@angular/core';
import {
  EMPTY,
  Observable,
  Subject,
  Subscription,
  catchError,
  map,
  of,
  switchMap,
} from 'rxjs';

/**
 * One block served by the source.
 *
 * `pagina` and `porPagina` describe the request that produced the block, not
 * the logical page the user is looking at: the screen asks for 100 records and
 * then slices them into logical pages of 20.
 */
export interface PaginaBuffer<T> {
  readonly items: readonly T[];
  /** Page number the source served. */
  readonly pagina: number;
  /** Page size the source applied. */
  readonly porPagina: number;
  /** Records that match the filter, across every block. */
  readonly total: number;
}

/** Loads one block. `pagina` is the block number, `porPagina` its size. */
export type CargadorBloque<T> = (pagina: number, porPagina: number) => Observable<PaginaBuffer<T>>;

/** Configuration of the buffer. All sizes are in records. */
export interface OpcionesPaginatedBuffer {
  /** Rows the user sees per logical page. */
  readonly porPagina: number;
  /** Hard ceiling of a block. The block is the largest multiple of `porPagina` that fits. */
  readonly maxPorBloque: number;
  /** How many blocks are kept. One is enough for the current window; more allow going back. */
  readonly maxBloques?: number;
  /** Age after which a block is refetched. `0` disables expiry. */
  readonly ttlMs?: number;
  /** Clock, injectable so the TTL can be tested without real waits. */
  readonly ahora?: () => number;
}

interface Bloque<T> extends PaginaBuffer<T> {
  readonly cargadoEn: number;
}

interface SolicitudCarga {
  readonly tipo: 'carga';
  readonly id: number;
  /** Logical page the user is asking for. */
  readonly destino: number;
  /** Block number that holds `destino`. */
  readonly bloque: number;
  /** Block size, captured so a later page-size change cannot alter an in-flight request. */
  readonly porBloque: number;
}

interface SolicitudCancelar {
  readonly tipo: 'cancelar';
  readonly id: number;
}

type Solicitud = SolicitudCarga | SolicitudCancelar;

type Resultado<T> =
  | {
      readonly tipo: 'ok';
      readonly id: number;
      readonly destino: number;
      readonly bloque: Bloque<T>;
    }
  | {
      readonly tipo: 'error';
      readonly id: number;
      readonly destino: number;
      readonly error: unknown;
    };

/**
 * Paging in two levels: a small logical page for the UI and a larger block for
 * the network.
 *
 * The screen asks for page 1 and the buffer fetches records 1–100. Pages 2–5
 * are slices of that block and cost no request. Page 6 crosses the block edge
 * and fetches records 101–200 once. The old rows stay on screen while that
 * request is in flight, so the list never blinks or loses its position.
 *
 * The buffer owns no presentation: it exposes signals and methods, and the
 * screen decides how a row, a waiting period or an error looks.
 *
 * Cancellation is idiomatic Angular: every request goes through `switchMap`,
 * so a new block unsubscribes the previous one, and `destruir()` releases the
 * last one when the owner goes away. HttpClient aborts the underlying XHR or
 * fetch request on unsubscribe, which is the equivalent of an AbortController.
 */
export class PaginatedBuffer<T> {
  private readonly cargar: CargadorBloque<T>;
  private readonly maxPorBloque: number;
  private readonly maxBloques: number;
  private readonly ttlMs: number;
  private readonly ahora: () => number;

  private readonly _pagina = signal(1);
  private readonly _porPagina = signal(1);
  private readonly _bloques = signal<ReadonlyMap<number, Bloque<T>>>(new Map());
  private readonly _cargandoInicial = signal(false);
  private readonly _cargandoBloque = signal(false);
  private readonly _error = signal<unknown | null>(null);
  private readonly _paginaObjetivo = signal<number | null>(null);

  private readonly solicitudes = new Subject<Solicitud>();
  private readonly suscripcion: Subscription;
  private ultimaSolicitud = 0;
  private destruido = false;

  /** Logical page on screen. */
  readonly pagina = this._pagina.asReadonly();

  /** Rows per logical page. */
  readonly porPagina = this._porPagina.asReadonly();

  /** Size of the block that backs the current window. */
  readonly porBloque = computed(() => this.bloqueDeTamano(this._porPagina()));

  /** How many logical pages one block holds. */
  readonly paginasPorBloque = computed(
    () => Math.max(1, Math.floor(this.porBloque() / this._porPagina())),
  );

  /** Block behind the page on screen, or `null` before the first answer. */
  readonly bloque = computed(() => this._bloques().get(this.bloqueDe(this._pagina())) ?? null);

  /** True once a block has been served. `total = 0` alone does not mean "no data yet". */
  readonly hayDatos = computed(() => this.bloque() !== null);

  /** Rows of the logical page, sliced out of the cached block. */
  readonly filas = computed<readonly T[]>(() => {
    const bloque = this.bloque();
    if (bloque === null) {
      return [];
    }

    const desde = this.desplazamientoEnBloque(this._pagina());
    return bloque.items.slice(desde, desde + this._porPagina());
  });

  /** Total reported by the backend for the current filter. */
  readonly total = computed(() => this.bloque()?.total ?? 0);

  /** Logical pages. The backend's `total_paginas` counts blocks, not these. */
  readonly totalPaginas = computed(() => {
    if (this.bloque() === null) {
      return 0;
    }
    return Math.max(1, Math.ceil(this.total() / this._porPagina()));
  });

  /** First record on screen, 1-based. `0` when the roster is empty. */
  readonly desde = computed(() =>
    this.total() === 0 ? 0 : (this._pagina() - 1) * this._porPagina() + 1,
  );

  /** Last record on screen. `0` when the roster is empty. */
  readonly hasta = computed(() =>
    this.total() === 0 ? 0 : Math.min(this._pagina() * this._porPagina(), this.total()),
  );

  /** Offset of the block in the complete result set. */
  readonly offsetBloque = computed(() => {
    const bloque = this.bloque();
    return bloque === null ? null : (bloque.pagina - 1) * bloque.porPagina;
  });

  /** Offset of the logical page in the complete result set. */
  readonly offsetPagina = computed(() => (this._pagina() - 1) * this._porPagina());

  /** Block number behind the page on screen. */
  readonly paginaBloque = computed(() => this.bloque()?.pagina ?? null);

  /** Number of blocks currently held. Exposed for diagnostics and tests. */
  readonly bloquesEnCache = computed(() => this._bloques().size);

  /** `true` while the very first block is on its way and there is nothing to show. */
  readonly cargandoInicial = this._cargandoInicial.asReadonly();

  /** `true` while a new block is on its way and the previous rows stay on screen. */
  readonly cargandoBloque = this._cargandoBloque.asReadonly();

  /** `true` during either kind of load. */
  readonly cargando = computed(() => this._cargandoInicial() || this._cargandoBloque());

  /** Last failure, or `null`. The screen maps it to copy and to an action. */
  readonly error = this._error.asReadonly();

  /** Page the in-flight request (or the failed one) was trying to reach. */
  readonly paginaObjetivo = this._paginaObjetivo.asReadonly();

  readonly hayAnterior = computed(() => this._pagina() > 1);
  readonly haySiguiente = computed(() => this._pagina() < this.totalPaginas());

  constructor(cargar: CargadorBloque<T>, opciones: OpcionesPaginatedBuffer) {
    this.cargar = cargar;
    this.maxPorBloque = Math.max(1, Math.floor(opciones.maxPorBloque));
    this.maxBloques = Math.max(1, Math.floor(opciones.maxBloques ?? 3));
    this.ttlMs = Math.max(0, opciones.ttlMs ?? 0);
    this.ahora = opciones.ahora ?? Date.now;
    this._porPagina.set(this.normalizarPorPagina(opciones.porPagina));

    this.suscripcion = this.solicitudes
      .pipe(
        switchMap((solicitud): Observable<Resultado<T>> => {
          if (solicitud.tipo === 'cancelar') {
            return EMPTY;
          }

          return this.cargar(solicitud.bloque, solicitud.porBloque).pipe(
            map(
              (pagina): Resultado<T> => ({
                tipo: 'ok',
                id: solicitud.id,
                destino: solicitud.destino,
                // The requested block is authoritative for the cache key: an
                // out-of-range page can answer with an empty body, and keying
                // it by the served page would break the window mapping.
                bloque: {
                  pagina: solicitud.bloque,
                  porPagina: solicitud.porBloque,
                  items: pagina.items,
                  total: pagina.total,
                  cargadoEn: this.ahora(),
                },
              }),
            ),
            catchError((error: unknown): Observable<Resultado<T>> =>
              of({
                tipo: 'error',
                id: solicitud.id,
                destino: solicitud.destino,
                error,
              }),
            ),
          );
        }),
      )
      .subscribe((resultado) => this.recibir(resultado));
  }

  /**
   * Starts the buffer on a page. The page is adopted immediately, so a deep
   * link keeps its number in the URL while the block loads and after a failure.
   */
  iniciar(pagina = 1): void {
    if (this.destruido) {
      return;
    }

    const destino = this.paginaValida(pagina);
    this._pagina.set(destino);
    this._bloques.set(new Map());
    this._error.set(null);
    this.solicitar(destino);
  }

  /**
   * Moves to a logical page.
   *
   * Inside the cached block it is a signal write and nothing else. Outside it
   * starts one request; the previous rows stay until the answer arrives.
   */
  irAPagina(destino: number): void {
    if (this.destruido || !Number.isInteger(destino) || destino < 1) {
      return;
    }

    if (this.totalPaginas() > 0 && destino > this.totalPaginas()) {
      return;
    }

    if (destino === this._pagina() && this._error() === null) {
      return;
    }

    const bloque = this.obtenerVigente(this.bloqueDe(destino));
    if (bloque !== null) {
      // A cache hit still has to win over an in-flight block: going back while
      // page 6 loads must not let its late answer overwrite page 5.
      this.cancelarPendiente();
      this._pagina.set(destino);
      this._error.set(null);
      this._paginaObjetivo.set(null);
      return;
    }

    this.solicitar(destino);
  }

  primera(): void {
    this.irAPagina(1);
  }

  ultima(): void {
    const total = this.totalPaginas();
    if (total > 0) {
      this.irAPagina(total);
    }
  }

  /**
   * Refetches the current block and keeps its rows on screen while it loads.
   * Used by the refresh button and after a mutation that changes the roster.
   *
   * The other blocks are dropped: the roster has changed, so a count cached
   * before the mutation would contradict the fresh total and could even make
   * the screen step to a page of the old result set. Only the block on screen
   * survives, because its rows are what the user is still reading.
   */
  recargar(): void {
    if (this.destruido) {
      return;
    }

    const actual = this._bloques().get(this.bloqueDe(this._pagina()));
    this._bloques.set(actual === undefined ? new Map() : new Map([[actual.pagina, actual]]));
    this.solicitar(this._pagina());
  }

  /**
   * Retries the page that failed. When a block request fails, the target page
   * is remembered, so the retry does not silently reload the page on screen.
   */
  reintentar(): void {
    if (this.destruido) {
      return;
    }
    this.solicitar(this._paginaObjetivo() ?? this._pagina());
  }

  /** Clears the cache and starts again at page 1. Used when the filter changes. */
  reiniciar(): void {
    if (this.destruido) {
      return;
    }

    this._bloques.set(new Map());
    this._pagina.set(1);
    this._error.set(null);
    this.solicitar(1);
  }

  /** Changes the logical page size. A different size is a different window. */
  cambiarPorPagina(valor: number): void {
    const porPagina = this.normalizarPorPagina(valor);

    if (this.destruido || porPagina === this._porPagina()) {
      return;
    }

    this._porPagina.set(porPagina);
    this._bloques.set(new Map());
    this._pagina.set(1);
    this._error.set(null);
    this.solicitar(1);
  }

  /** Releases the subscription. The owner calls it when the screen goes away. */
  destruir(): void {
    if (this.destruido) {
      return;
    }
    this.destruido = true;
    this.suscripcion.unsubscribe();
    this.solicitudes.complete();
  }

  private solicitar(destino: number): void {
    if (this.destruido) {
      return;
    }

    this._error.set(null);
    this._paginaObjetivo.set(destino);

    // With rows on screen, a block miss keeps them visible. Without rows, there
    // is nothing to keep and the screen gets its skeleton.
    const conservarFilas = this.bloque() !== null;
    this._cargandoInicial.set(!conservarFilas);
    this._cargandoBloque.set(conservarFilas);

    const id = ++this.ultimaSolicitud;
    this.solicitudes.next({
      tipo: 'carga',
      id,
      destino,
      bloque: this.bloqueDe(destino),
      porBloque: this.porBloque(),
    });
  }

  private recibir(resultado: Resultado<T>): void {
    if (this.destruido || resultado.id !== this.ultimaSolicitud) {
      return;
    }

    this._cargandoInicial.set(false);
    this._cargandoBloque.set(false);

    if (resultado.tipo === 'error') {
      // The page on screen stays where it was; the target stays remembered for
      // the retry button.
      this._error.set(resultado.error);
      return;
    }

    this.guardarBloque(resultado.bloque);
    this._pagina.set(resultado.destino);
    this._paginaObjetivo.set(null);
    this._error.set(null);
    this.ajustarFueraDeRango();
  }

  private cancelarPendiente(): void {
    if (!this.cargando()) {
      return;
    }

    const id = ++this.ultimaSolicitud;
    this.solicitudes.next({ tipo: 'cancelar', id });
    this._cargandoInicial.set(false);
    this._cargandoBloque.set(false);
    this._paginaObjetivo.set(null);
  }

  /**
   * If a refetch shrank the result set, the page on screen may no longer exist.
   * The buffer steps back to the last page instead of showing an empty window.
   */
  private ajustarFueraDeRango(): void {
    const total = this.totalPaginas();
    if (total > 0 && this._pagina() > total) {
      this.irAPagina(total);
    }
  }

  private guardarBloque(bloque: Bloque<T>): void {
    const mapa = new Map(this._bloques());

    // Reinserting moves the block to the end: the map's insertion order is the
    // LRU order.
    mapa.delete(bloque.pagina);
    mapa.set(bloque.pagina, bloque);

    while (mapa.size > this.maxBloques) {
      const masViejo = mapa.keys().next().value;
      if (masViejo === undefined) {
        break;
      }
      mapa.delete(masViejo);
    }

    this._bloques.set(mapa);
  }

  /**
   * Returns a block only when it is still fresh, and touches it for the LRU.
   *
   * An expired block is not deleted: it stays as the rows the screen shows while
   * its replacement travels, so the list does not blink every five minutes.
   * It is a method, not a computed, because the touch writes the map signal.
   */
  private obtenerVigente(paginaBloque: number): Bloque<T> | null {
    const mapa = this._bloques();
    const bloque = mapa.get(paginaBloque);

    if (bloque === undefined) {
      return null;
    }

    if (this.ttlMs > 0 && this.ahora() - bloque.cargadoEn >= this.ttlMs) {
      // The stale block stays in the cache: the request it triggers keeps its
      // rows on screen, and a failure leaves the last answer visible instead of
      // blanking a list the user was reading.
      return null;
    }

    const tocado = new Map(mapa);
    tocado.delete(paginaBloque);
    tocado.set(paginaBloque, bloque);
    this._bloques.set(tocado);
    return bloque;
  }

  private bloqueDe(pagina: number): number {
    return Math.floor((pagina - 1) / this.paginasPorBloque()) + 1;
  }

  private desplazamientoEnBloque(pagina: number): number {
    return ((pagina - 1) * this._porPagina()) % this.porBloque();
  }

  private bloqueDeTamano(porPagina: number): number {
    const multiplo = Math.floor(this.maxPorBloque / porPagina) * porPagina;
    return Math.max(porPagina, multiplo);
  }

  private normalizarPorPagina(valor: number): number {
    return Number.isFinite(valor) && valor >= 1 ? Math.floor(valor) : 1;
  }

  private paginaValida(pagina: number): number {
    return Number.isInteger(pagina) && pagina >= 1 ? pagina : 1;
  }
}
