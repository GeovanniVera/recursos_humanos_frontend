import { Subject } from 'rxjs';
import {
  CargadorBloque,
  OpcionesPaginatedBuffer,
  PaginaBuffer,
  PaginatedBuffer,
} from './paginated-buffer';

interface Llamada {
  readonly pagina: number;
  readonly porPagina: number;
}

/**
 * Stand-in for the endpoint.
 *
 * Every request stays open until the test answers it, which is what lets the
 * suite look at the screen mid-flight: the rows that have to survive a block
 * miss, the loading flags and the cancellation of a superseded request.
 */
class Fuente {
  readonly llamadas: Llamada[] = [];
  private readonly pendientes: Subject<PaginaBuffer<number>>[] = [];

  readonly cargar: CargadorBloque<number> = (pagina, porPagina) => {
    this.llamadas.push({ pagina, porPagina });
    const pendiente = new Subject<PaginaBuffer<number>>();
    this.pendientes.push(pendiente);
    return pendiente.asObservable();
  };

  get solicitudes(): number {
    return this.llamadas.length;
  }

  get ultima(): Llamada {
    return this.llamadas[this.llamadas.length - 1];
  }

  responder(indice: number, items: readonly number[], total: number): void {
    const llamada = this.llamadas[indice];
    const pendiente = this.pendientes[indice];
    pendiente.next({
      items,
      pagina: llamada.pagina,
      porPagina: llamada.porPagina,
      total,
    });
    pendiente.complete();
  }

  responderUltima(items: readonly number[], total: number): void {
    this.responder(this.llamadas.length - 1, items, total);
  }

  fallarUltima(error: unknown): void {
    const pendiente = this.pendientes[this.pendientes.length - 1];
    pendiente.error(error);
    pendiente.complete();
  }
}

/** Inclusive range: the records a block of the fake endpoint carries. */
function rango(desde: number, hasta: number): number[] {
  return Array.from({ length: hasta - desde + 1 }, (_, index) => desde + index);
}

/** Logical page 20, block 100: five pages per request. */
const BASE: OpcionesPaginatedBuffer = {
  porPagina: 20,
  maxPorBloque: 100,
  maxBloques: 3,
  ttlMs: 0,
};

function crear(
  fuente: Fuente,
  opciones: Partial<OpcionesPaginatedBuffer> = {},
): PaginatedBuffer<number> {
  return new PaginatedBuffer<number>(fuente.cargar, { ...BASE, ...opciones });
}

describe('PaginatedBuffer', () => {
  it('asks for a block of 100 while the user sees pages of 20', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);

    buffer.iniciar();

    expect(fuente.llamadas).toEqual([{ pagina: 1, porPagina: 100 }]);
    expect(buffer.pagina()).toBe(1);
    expect(buffer.porPagina()).toBe(20);
    expect(buffer.porBloque()).toBe(100);
    expect(buffer.paginasPorBloque()).toBe(5);
    expect(buffer.cargandoInicial()).toBe(true);
    expect(buffer.filas()).toEqual([]);
    expect(buffer.hayDatos()).toBe(false);

    fuente.responderUltima(rango(1, 100), 250);

    expect(buffer.filas()).toEqual(rango(1, 20));
    expect(buffer.total()).toBe(250);
    // 250 / 20 = 12.5: thirteen logical pages, not the backend's three blocks.
    expect(buffer.totalPaginas()).toBe(13);
    expect(buffer.desde()).toBe(1);
    expect(buffer.hasta()).toBe(20);
    expect(buffer.hayDatos()).toBe(true);
    expect(buffer.cargandoInicial()).toBe(false);
  });

  it('serves the pages of a cached block without sending a request', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);

    buffer.iniciar();
    fuente.responderUltima(rango(1, 100), 250);

    buffer.irAPagina(2);
    expect(fuente.solicitudes).toBe(1);
    expect(buffer.filas()).toEqual(rango(21, 40));
    expect(buffer.desde()).toBe(21);
    expect(buffer.hasta()).toBe(40);

    buffer.irAPagina(5);
    expect(fuente.solicitudes).toBe(1);
    expect(buffer.filas()).toEqual(rango(81, 100));
    expect(buffer.pagina()).toBe(5);
    expect(buffer.paginaBloque()).toBe(1);
  });

  it('crosses the block edge with one request and keeps the current rows meanwhile', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);

    buffer.iniciar();
    fuente.responderUltima(rango(1, 100), 250);

    buffer.irAPagina(5);
    buffer.irAPagina(6);

    expect(fuente.solicitudes).toBe(2);
    expect(fuente.ultima).toEqual({ pagina: 2, porPagina: 100 });
    // The page on screen and its rows stay put until the block arrives.
    expect(buffer.pagina()).toBe(5);
    expect(buffer.paginaObjetivo()).toBe(6);
    expect(buffer.filas()).toEqual(rango(81, 100));
    expect(buffer.cargandoBloque()).toBe(true);
    expect(buffer.cargandoInicial()).toBe(false);

    fuente.responderUltima(rango(101, 200), 250);

    expect(buffer.pagina()).toBe(6);
    expect(buffer.filas()).toEqual(rango(101, 120));
    expect(buffer.desde()).toBe(101);
    expect(buffer.hasta()).toBe(120);
    expect(buffer.cargandoBloque()).toBe(false);
    expect(buffer.paginaObjetivo()).toBeNull();
  });

  it('shows the partial last page and refuses to leave the range', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);

    buffer.iniciar();
    fuente.responderUltima(rango(1, 42), 42);

    buffer.irAPagina(3);

    // Still the first block: no request.
    expect(fuente.solicitudes).toBe(1);
    expect(buffer.filas()).toEqual(rango(41, 42));
    expect(buffer.desde()).toBe(41);
    expect(buffer.hasta()).toBe(42);
    expect(buffer.totalPaginas()).toBe(3);
    expect(buffer.haySiguiente()).toBe(false);

    buffer.irAPagina(4);
    expect(buffer.pagina()).toBe(3);
    expect(fuente.solicitudes).toBe(1);

    buffer.primera();
    expect(buffer.pagina()).toBe(1);
    buffer.ultima();
    expect(buffer.pagina()).toBe(3);
  });

  it('adopts the page of a deep link before the block arrives', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);

    buffer.iniciar(6);

    expect(buffer.pagina()).toBe(6);
    expect(fuente.llamadas).toEqual([{ pagina: 2, porPagina: 100 }]);
    expect(buffer.paginaObjetivo()).toBe(6);
    expect(buffer.filas()).toEqual([]);

    fuente.responderUltima(rango(101, 200), 250);

    expect(buffer.filas()).toEqual(rango(101, 120));
    expect(buffer.desde()).toBe(101);
  });

  it('refetches a block older than the TTL without dropping its rows', () => {
    const fuente = new Fuente();
    let reloj = 0;
    const buffer = crear(fuente, { ttlMs: 1000, ahora: () => reloj });

    buffer.iniciar();
    fuente.responderUltima(rango(1, 100), 250);

    buffer.irAPagina(2);
    expect(fuente.solicitudes).toBe(1);

    reloj = 1000;
    buffer.irAPagina(3);

    expect(fuente.solicitudes).toBe(2);
    expect(fuente.ultima).toEqual({ pagina: 1, porPagina: 100 });
    // The stale block still supplies the rows while its replacement travels.
    expect(buffer.filas()).toEqual(rango(21, 40));
    expect(buffer.cargandoBloque()).toBe(true);

    fuente.responderUltima(rango(1, 100), 250);
    expect(buffer.pagina()).toBe(3);
    expect(buffer.filas()).toEqual(rango(41, 60));
  });

  it('keeps three blocks and refetches the least recently used one', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);

    buffer.iniciar();
    fuente.responderUltima(rango(1, 100), 500);

    // Blocks 2, 3 and 4 evict block 1: four loaded, only three kept.
    for (const [indice, pagina, bloque] of [
      [1, 6, 2],
      [2, 11, 3],
      [3, 16, 4],
    ] as const) {
      buffer.irAPagina(pagina);
      fuente.responder(indice, rango((bloque - 1) * 100 + 1, bloque * 100), 500);
    }

    expect(buffer.bloquesEnCache()).toBe(3);

    buffer.irAPagina(1);
    expect(fuente.ultima).toEqual({ pagina: 1, porPagina: 100 });
    expect(fuente.solicitudes).toBe(5);
  });

  it('cancels a superseded block so its late answer cannot overwrite the screen', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);

    buffer.iniciar();
    fuente.responderUltima(rango(1, 100), 250);

    buffer.irAPagina(6);
    expect(buffer.cargandoBloque()).toBe(true);

    // Going back inside the cached block wins over the request in flight.
    buffer.irAPagina(5);
    expect(buffer.pagina()).toBe(5);
    expect(buffer.cargandoBloque()).toBe(false);
    expect(buffer.filas()).toEqual(rango(81, 100));

    // The answer for block 2 arrives after the cancellation: it is dropped.
    fuente.responder(1, rango(101, 200), 250);

    expect(buffer.pagina()).toBe(5);
    expect(buffer.filas()).toEqual(rango(81, 100));
    expect(buffer.total()).toBe(250);
  });

  it('refreshes the current block while the rows stay on screen', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);

    buffer.iniciar();
    fuente.responderUltima(rango(1, 100), 250);
    buffer.irAPagina(2);

    const antes = buffer.filas();
    buffer.recargar();

    expect(fuente.ultima).toEqual({ pagina: 1, porPagina: 100 });
    expect(buffer.cargandoBloque()).toBe(true);
    expect(buffer.filas()).toEqual(antes);

    fuente.responderUltima(rango(1, 100), 249);

    expect(buffer.pagina()).toBe(2);
    expect(buffer.total()).toBe(249);
    expect(buffer.filas()).toEqual(rango(21, 40));
  });

  it('retries the page that failed, not the page that stayed on screen', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);
    const fallo = new Error('sin conexión');

    buffer.iniciar();
    fuente.responderUltima(rango(1, 100), 250);

    buffer.irAPagina(6);
    fuente.fallarUltima(fallo);

    expect(buffer.pagina()).toBe(1);
    expect(buffer.paginaObjetivo()).toBe(6);
    expect(buffer.error()).toBe(fallo);
    expect(buffer.filas()).toEqual(rango(1, 20));
    expect(buffer.cargandoBloque()).toBe(false);

    buffer.reintentar();

    expect(buffer.error()).toBeNull();
    expect(fuente.ultima).toEqual({ pagina: 2, porPagina: 100 });

    fuente.responderUltima(rango(101, 200), 250);
    expect(buffer.pagina()).toBe(6);
    expect(buffer.filas()).toEqual(rango(101, 120));
    expect(buffer.paginaObjetivo()).toBeNull();
  });

  it('restarts at page 1 and recomputes the block when the page size changes', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);

    buffer.iniciar();
    fuente.responderUltima(rango(1, 100), 250);
    buffer.irAPagina(3);

    buffer.cambiarPorPagina(50);

    expect(buffer.porPagina()).toBe(50);
    // The largest multiple of 50 that fits in the contract's 100.
    expect(buffer.porBloque()).toBe(100);
    expect(buffer.paginasPorBloque()).toBe(2);
    expect(buffer.pagina()).toBe(1);
    expect(fuente.ultima).toEqual({ pagina: 1, porPagina: 100 });

    fuente.responderUltima(rango(1, 100), 250);

    expect(buffer.filas()).toEqual(rango(1, 50));

    buffer.irAPagina(2);
    expect(fuente.solicitudes).toBe(2);
    expect(buffer.filas()).toEqual(rango(51, 100));

    buffer.irAPagina(3);
    expect(fuente.ultima).toEqual({ pagina: 2, porPagina: 100 });
  });

  it('steps back when a refetch shrinks the result set below the current page', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);

    buffer.iniciar();
    fuente.responderUltima(rango(1, 100), 250);
    buffer.irAPagina(6);
    fuente.responderUltima(rango(101, 200), 250);

    expect(buffer.pagina()).toBe(6);

    buffer.recargar();
    fuente.responderUltima(rango(101, 120), 100);

    // The refreshed block reports five pages, so page 6 no longer exists. The
    // refresh dropped the other blocks, and stepping back fetches block 1.
    expect(buffer.totalPaginas()).toBe(5);
    expect(fuente.ultima).toEqual({ pagina: 1, porPagina: 100 });

    fuente.responderUltima(rango(1, 100), 100);

    expect(buffer.pagina()).toBe(5);
    expect(buffer.filas()).toEqual(rango(81, 100));
  });

  it('releases the in-flight request when the owner goes away', () => {
    const fuente = new Fuente();
    const buffer = crear(fuente);

    buffer.iniciar();
    buffer.destruir();

    // The answer of a disposed buffer is never applied.
    fuente.responderUltima(rango(1, 100), 250);

    expect(buffer.filas()).toEqual([]);
    expect(buffer.hayDatos()).toBe(false);
  });
});
