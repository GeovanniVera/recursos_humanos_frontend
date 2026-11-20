import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { BitacoraService } from './bitacora.service';

const BASE_URL = `${environment.apiBaseUrl}/bitacora`;

describe('BitacoraService', () => {
  let service: BitacoraService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BitacoraService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('consulta sin parámetros no envía query params', () => {
    service.consultar().subscribe();
    const req = http.expectOne((r) => r.url === BASE_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush({ datos: [], meta: { pagina: 1, por_pagina: 20, total: 0, total_paginas: 0 }, enlaces: { anterior: null, siguiente: null } });
  });

  it('recorta texto y omite valores vacíos', () => {
    service
      .consultar({ modulo: '  expediente  ', accion: '   ', buscar: '  Ana  ' })
      .subscribe();

    const req = http.expectOne((r) => r.url === BASE_URL);
    expect(req.request.params.get('modulo')).toBe('expediente');
    expect(req.request.params.get('buscar')).toBe('Ana');
    expect(req.request.params.has('accion')).toBe(false);
    req.flush({ datos: [], meta: { pagina: 1, por_pagina: 20, total: 0, total_paginas: 0 }, enlaces: { anterior: null, siguiente: null } });
  });

  it('no envía orden por defecto desc, pero sí envía asc', () => {
    service.consultar({ orden: 'desc' }).subscribe();
    const reqDesc = http.expectOne((r) => r.url === BASE_URL);
    expect(reqDesc.request.params.has('orden')).toBe(false);
    reqDesc.flush({ datos: [], meta: { pagina: 1, por_pagina: 20, total: 0, total_paginas: 0 }, enlaces: { anterior: null, siguiente: null } });

    service.consultar({ orden: 'asc' }).subscribe();
    const reqAsc = http.expectOne((r) => r.url === BASE_URL);
    expect(reqAsc.request.params.get('orden')).toBe('asc');
    reqAsc.flush({ datos: [], meta: { pagina: 1, por_pagina: 20, total: 0, total_paginas: 0 }, enlaces: { anterior: null, siguiente: null } });
  });

  it('envía fechas válidas y omite inválidas', () => {
    service.consultar({ fechaDesde: '2026-11-01', fechaHasta: '11/2026' }).subscribe();
    const req = http.expectOne((r) => r.url === BASE_URL);
    expect(req.request.params.get('fecha_desde')).toBe('2026-11-01');
    expect(req.request.params.has('fecha_hasta')).toBe(false);
    req.flush({ datos: [], meta: { pagina: 1, por_pagina: 20, total: 0, total_paginas: 0 }, enlaces: { anterior: null, siguiente: null } });
  });

  it('envía números válidos y omite inválidos', () => {
    service.consultar({ usuarioId: 12, pagina: 2, porPagina: 50 }).subscribe();
    let req = http.expectOne((r) => r.url === BASE_URL);
    expect(req.request.params.get('usuario_id')).toBe('12');
    expect(req.request.params.get('pagina')).toBe('2');
    expect(req.request.params.get('por_pagina')).toBe('50');
    req.flush({ datos: [], meta: { pagina: 2, por_pagina: 50, total: 0, total_paginas: 0 }, enlaces: { anterior: null, siguiente: null } });

    service.consultar({ usuarioId: 0, pagina: 0, porPagina: -1 }).subscribe();
    req = http.expectOne((r) => r.url === BASE_URL);
    expect(req.request.params.has('usuario_id')).toBe(false);
    expect(req.request.params.has('pagina')).toBe(false);
    expect(req.request.params.has('por_pagina')).toBe(false);
    req.flush({ datos: [], meta: { pagina: 1, por_pagina: 20, total: 0, total_paginas: 0 }, enlaces: { anterior: null, siguiente: null } });
  });

  it('consulta el detalle por id', () => {
    service.detalle(481).subscribe();
    const req = http.expectOne(`${BASE_URL}/481`);
    expect(req.request.method).toBe('GET');
    req.flush({
      datos: {
        id: 481,
        fecha: '2026-11-18T18:42:11+00:00',
        usuario_id: 12,
        usuario_historico: 'Ana López',
        accion: 'empleado.baja',
        modulo: 'expediente',
        descripcion: 'Baja definitiva del trabajador 1002.',
        ip: '10.0.0.8',
        datos_antes: { estatus: 'activo' },
        datos_despues: { estatus: 'baja_definitiva' },
      },
    });
  });
});
