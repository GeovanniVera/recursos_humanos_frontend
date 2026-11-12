import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PadronBufferStore } from './padron-buffer.store';
import { EmpleadoPadron, PadronResponse } from './padron.models';

const URL_PADRON = `${environment.apiBaseUrl}/padron`;

function rango(desde: number, hasta: number): number[] {
  return Array.from({ length: hasta - desde + 1 }, (_, index) => desde + index);
}

function empleado(id: number): EmpleadoPadron {
  return {
    id,
    num_empleado: String(10000 + id),
    nombre: `Empleado ${id}`,
    area: null,
    estado: 'Activo',
  };
}

/** One block as the endpoint answers it: 100 records, counters of the block. */
function bloque(pagina: number, total: number, desde: number, hasta: number): PadronResponse {
  return {
    datos: rango(desde, hasta).map(empleado),
    meta: {
      pagina,
      por_pagina: 100,
      total,
      total_paginas: Math.ceil(total / 100),
    },
    enlaces: { anterior: null, siguiente: null },
  };
}

describe('PadronBufferStore', () => {
  let store: PadronBufferStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PadronBufferStore, provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(PadronBufferStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  function esperar(): TestRequest {
    return httpMock.expectOne((request) => request.url === URL_PADRON);
  }

  it('asks the endpoint for a block of 100 and slices it into pages of 20', () => {
    store.iniciar();

    const request = esperar();
    expect(request.request.params.get('pagina')).toBe('1');
    expect(request.request.params.get('por_pagina')).toBe('100');
    expect(request.request.params.has('buscar')).toBe(false);

    request.flush(bloque(1, 250, 1, 100));

    expect(store.pagina()).toBe(1);
    expect(store.porPagina()).toBe(20);
    expect(store.porBloque()).toBe(100);
    expect(store.filas().length).toBe(20);
    expect(store.filas()[0].id).toBe(1);
    expect(store.total()).toBe(250);
    expect(store.totalPaginas()).toBe(13);
    expect(store.desde()).toBe(1);
    expect(store.hasta()).toBe(20);
  });

  it('sends no request while the logical page stays inside the block', () => {
    store.iniciar();
    esperar().flush(bloque(1, 250, 1, 100));

    store.irAPagina(2);
    store.irAPagina(5);

    // Nothing arrived at the endpoint: both slices came out of the cache.
    expect(httpMock.match(URL_PADRON).length).toBe(0);
    expect(store.pagina()).toBe(5);
    expect(store.filas()[0].id).toBe(81);
    expect(store.desde()).toBe(81);
    expect(store.hasta()).toBe(100);
  });

  it('asks for the next block once the logical page crosses the edge', () => {
    store.iniciar();
    esperar().flush(bloque(1, 250, 1, 100));

    store.irAPagina(5);
    store.irAPagina(6);

    const request = esperar();
    expect(request.request.params.get('pagina')).toBe('2');
    expect(request.request.params.get('por_pagina')).toBe('100');
    expect(store.pagina()).toBe(5);
    expect(store.filas()[0].id).toBe(81);
    expect(store.cargandoBloque()).toBe(true);

    request.flush(bloque(2, 250, 101, 200));

    expect(store.pagina()).toBe(6);
    expect(store.filas()[0].id).toBe(101);
    expect(store.desde()).toBe(101);
    expect(store.hasta()).toBe(120);
  });

  it('drops the block cache and returns to page 1 when the term changes', () => {
    store.iniciar();
    esperar().flush(bloque(1, 250, 1, 100));
    store.irAPagina(2);

    store.aplicarBusqueda('  ana  ');

    const busqueda = esperar();
    expect(busqueda.request.params.get('buscar')).toBe('ana');
    expect(busqueda.request.params.get('pagina')).toBe('1');
    expect(busqueda.request.params.get('por_pagina')).toBe('100');
    expect(store.buscar()).toBe('ana');
    expect(store.pagina()).toBe(1);

    busqueda.flush(bloque(1, 1, 1, 1));

    expect(store.filas().length).toBe(1);
    expect(store.total()).toBe(1);

    // The same term is not a new result set.
    store.aplicarBusqueda('ana');
    expect(httpMock.match(URL_PADRON).length).toBe(0);

    // An empty term goes back to the whole roster, this time without `buscar`.
    store.aplicarBusqueda('   ');
    const todo = esperar();
    expect(todo.request.params.has('buscar')).toBe(false);
    expect(todo.request.params.get('pagina')).toBe('1');
    todo.flush(bloque(1, 250, 1, 100));
  });

  it('keeps the block size at 100 when the logical page size changes', () => {
    store.iniciar();
    esperar().flush(bloque(1, 250, 1, 100));

    store.cambiarPorPagina(50);

    const cambio = esperar();
    expect(cambio.request.params.get('pagina')).toBe('1');
    // 100 is the largest multiple of 50 the contract accepts.
    expect(cambio.request.params.get('por_pagina')).toBe('100');
    expect(store.porPagina()).toBe(50);
    expect(store.pagina()).toBe(1);

    cambio.flush(bloque(1, 250, 1, 100));

    expect(store.filas().length).toBe(50);
    expect(store.totalPaginas()).toBe(5);
    expect(store.hasta()).toBe(50);
  });

  it('refreshes and retries the block behind the visible page', () => {
    store.iniciar();
    esperar().flush(bloque(1, 250, 1, 100));
    store.irAPagina(6);
    esperar().flush(bloque(2, 250, 101, 200));

    store.recargar();

    const recarga = esperar();
    expect(recarga.request.params.get('pagina')).toBe('2');
    expect(store.pagina()).toBe(6);
    recarga.flush(bloque(2, 250, 101, 200));
  });

  it('retries the target of a failed jump, not the page on screen', () => {
    store.iniciar();
    esperar().flush(bloque(1, 250, 1, 100));

    store.irAPagina(6);
    esperar().flush(
      { mensaje: 'El servicio no está disponible.', codigo: 'servicio_no_disponible' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(store.pagina()).toBe(1);
    expect(store.paginaObjetivo()).toBe(6);
    expect(store.error()).not.toBeNull();

    store.reintentar();

    const reintento = esperar();
    expect(reintento.request.params.get('pagina')).toBe('2');
    reintento.flush(bloque(2, 250, 101, 200));

    expect(store.pagina()).toBe(6);
    expect(store.error()).toBeNull();
  });
});
