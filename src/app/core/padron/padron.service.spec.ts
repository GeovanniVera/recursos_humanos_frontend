import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PadronResponse } from './padron.models';
import { PadronService } from './padron.service';

const URL_PADRON = `${environment.apiBaseUrl}/padron`;

/** `200` body of the endpoint, straight from the contract. */
const RESPUESTA: PadronResponse = {
  datos: [
    {
      id: 1,
      num_empleado: '12345',
      nombre: 'Ana Martínez',
      area: { id: 3, nombre: 'Área A' },
      estado: 'Activo',
    },
  ],
  meta: { pagina: 1, por_pagina: 20, total: 42, total_paginas: 3 },
  enlaces: { anterior: null, siguiente: `${URL_PADRON}?pagina=2` },
};

describe('PadronService', () => {
  let service: PadronService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PadronService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  /**
   * The single request in flight.
   *
   * It matches on the URL without its query: the params are the thing under
   * test, so they are asserted one by one instead of baked into a full URL.
   */
  function esperar(): TestRequest {
    return httpMock.expectOne((peticion) => peticion.url === URL_PADRON);
  }

  it('asks GET /padron without params when the caller sets none', () => {
    service.consultar().subscribe();

    const request = esperar();
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().length).toBe(0);
    expect(request.request.body).toBeNull();

    request.flush(RESPUESTA);
  });

  it('sends only the params that are set, in the snake_case of the contract', () => {
    service.consultar({ pagina: 2 }).subscribe();

    const request = esperar();
    expect(request.request.params.keys()).toEqual(['pagina']);
    expect(request.request.params.get('pagina')).toBe('2');
    expect(request.request.params.has('buscar')).toBe(false);
    expect(request.request.params.has('por_pagina')).toBe(false);

    request.flush(RESPUESTA);
  });

  it('sends the term and the page size when both are given', () => {
    service.consultar({ buscar: '  ana  ', pagina: 3, porPagina: 50 }).subscribe();

    const request = esperar();
    expect(request.request.params.keys()).toEqual(['buscar', 'pagina', 'por_pagina']);
    // The term travels trimmed: the spaces of a text field are not a query.
    expect(request.request.params.get('buscar')).toBe('ana');
    expect(request.request.params.get('pagina')).toBe('3');
    expect(request.request.params.get('por_pagina')).toBe('50');

    request.flush(RESPUESTA);
  });

  it('drops a blank term instead of asking the API to search for nothing', () => {
    service.consultar({ buscar: '   ', pagina: 1 }).subscribe();

    const request = esperar();
    expect(request.request.params.has('buscar')).toBe(false);
    expect(request.request.params.keys()).toEqual(['pagina']);

    request.flush(RESPUESTA);
  });

  it('hands the whole answer to the caller', () => {
    let recibido: PadronResponse | undefined;
    service.consultar({ pagina: 1 }).subscribe((respuesta) => {
      recibido = respuesta;
    });

    esperar().flush(RESPUESTA);

    // `datos`, `meta` and `enlaces` are all part of the contract: the screen
    // needs the counters and the backend's own page number.
    expect(recibido).toEqual(RESPUESTA);
  });

  it('forwards the failure so the screen can decide what to show', () => {
    let estado: number | undefined;
    service.consultar().subscribe({
      error: (error: { status?: number }) => {
        estado = error.status;
      },
    });

    esperar().flush(
      { mensaje: 'El servicio no está disponible.', codigo: 'servicio_no_disponible' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(estado).toBe(503);
  });
});
