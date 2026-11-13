import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import {
  AreaCatalogo,
  AsignarAreaResponse,
  CatalogoDiagnostico,
  CategoriaCatalogo,
  DesasociarAreaResponse,
  PuestoCatalogo,
  PuestoCategoria,
} from './catalogos.models';
import { CatalogosService } from './catalogos.service';

const URL_CATALOGOS = `${environment.apiBaseUrl}/catalogos`;

/** The category a post declares, as the post list nests it. */
const ADMIN_PUESTO: PuestoCategoria = {
  id: 2,
  clave: 'ADMIN',
  tipo: 'administrativo',
  descripcion: 'Personal administrativo',
};

const MANDO_PUESTO: PuestoCategoria = {
  id: 3,
  clave: 'MANDO',
  tipo: 'mando_medio',
  descripcion: 'Mando medio',
};

/** `200` row of `GET /catalogos/puestos`, straight from the contract. */
const PUESTO: PuestoCatalogo = {
  id: 7,
  nombre: 'Analista',
  activo: true,
  categoria: ADMIN_PUESTO,
  areas: [{ id: 3, nombre: 'Depto. Sistemas' }],
};

const CATEGORIA: CategoriaCatalogo = {
  id: 2,
  clave: 'ADMIN',
  tipo: 'administrativo',
  descripcion: 'Personal administrativo',
  activo: true,
};

const AREA: AreaCatalogo = {
  id: 1,
  padre_id: null,
  nombre: 'Rectoría',
  asignable: false,
  activo: true,
};

const DIAGNOSTICO: CatalogoDiagnostico = {
  puestos_sin_area: 3,
  puestos_sin_empleados: 41,
  categorias_sin_uso: 0,
  empleados_sin_area: 0,
  puestos_con_clasificacion_contradicha: [
    { puesto: 'Coordinador', tipo_puesto: 'mando_medio', empleados_en_contra: 2 },
  ],
};

describe('CatalogosService', () => {
  let service: CatalogosService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  /**
   * The single request in flight, matched on its path.
   *
   * The match ignores the query string on purpose: the string overload compares
   * against `urlWithParams`, so it would miss every filtered request.
   */
  function esperar(ruta: string): TestRequest {
    return httpMock.expectOne((candidate) => candidate.url === `${URL_CATALOGOS}${ruta}`);
  }

  // --- Posts -----------------------------------------------------------------

  it('reads the posts with GET /catalogos/puestos and unwraps the envelope', () => {
    let puestos: PuestoCatalogo[] | undefined;
    service.puestos().subscribe((respuesta) => {
      puestos = respuesta;
    });

    const request = esperar('/puestos');
    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();
    // No filter is "no narrowing": an empty query string, not three defaults.
    expect(request.request.params.keys()).toEqual([]);

    request.flush({ data: [PUESTO] });

    // The screen never sees `data`: the envelope is the transport, not the model.
    expect(puestos).toEqual([PUESTO]);
  });

  it('sends the post filters the contract documents, and no other param', () => {
    service.puestos({ sin_area: true, sin_empleados: true, activo: false }).subscribe();

    const request = esperar('/puestos');
    expect(request.request.params.keys().sort()).toEqual(['activo', 'sin_area', 'sin_empleados']);
    expect(request.request.params.get('sin_area')).toBe('1');
    expect(request.request.params.get('sin_empleados')).toBe('1');
    // `activo=0` is a real filter, so it has to travel: omitting it would ask for
    // both states.
    expect(request.request.params.get('activo')).toBe('0');
    // There is no `area_id` in the contract, so it is never invented here.
    expect(request.request.params.has('area_id')).toBe(false);

    request.flush({ data: [] });
  });

  it('omits a filter that is off instead of sending a falsy value', () => {
    service.puestos({ activo: true }).subscribe();

    const request = esperar('/puestos');
    expect(request.request.params.keys()).toEqual(['activo']);
    expect(request.request.params.get('activo')).toBe('1');

    request.flush({ data: [PUESTO] });
  });

  it('changes the category of a post with PATCH /catalogos/puestos/{id}', () => {
    let puesto: PuestoCatalogo | undefined;
    service.editarPuesto(7, { categoria_cct_id: 3 }).subscribe((datos) => {
      puesto = datos;
    });

    const request = esperar('/puestos/7');
    expect(request.request.method).toBe('PATCH');
    // The category is the only field the endpoint accepts.
    expect(request.request.body).toEqual({ categoria_cct_id: 3 });

    // This one keeps the `data` envelope.
    request.flush({ data: { ...PUESTO, categoria: MANDO_PUESTO } });

    expect(puesto?.categoria).toEqual(MANDO_PUESTO);
  });

  it('assigns an area with POST /catalogos/puestos/asignar-area and the snake_case body', () => {
    let respuesta: AsignarAreaResponse | undefined;
    service.asignarArea([7, 8], 4).subscribe((datos) => {
      respuesta = datos;
    });

    const request = esperar('/puestos/asignar-area');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ puesto_ids: [7, 8], area_id: 4 });

    // This endpoint answers flat, without a `data` envelope.
    request.flush({
      creados: 2,
      puestos: [{ ...PUESTO, areas: [...PUESTO.areas, { id: 4, nombre: 'Depto. Recursos' }] }],
    });

    expect(respuesta?.creados).toBe(2);
    expect(respuesta?.puestos[0].areas.length).toBe(2);
  });

  it('removes one association with DELETE /catalogos/puestos/{puesto}/areas/{area}', () => {
    let respuesta: DesasociarAreaResponse | undefined;
    service.desasociarArea(7, 3).subscribe((datos) => {
      respuesta = datos;
    });

    const request = esperar('/puestos/7/areas/3');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();

    // Flat as well, like `asignar-area`.
    request.flush({ desasociado: true });

    expect(respuesta).toEqual({ desasociado: true });
  });

  it('forwards the 409 of an area the post still holds', () => {
    let codigo: string | undefined;
    service.desasociarArea(7, 3).subscribe({
      error: (error: { error?: { codigo?: string } }) => {
        codigo = error.error?.codigo;
      },
    });

    esperar('/puestos/7/areas/3').flush(
      { mensaje: 'El puesto tiene empleados en esa área.', codigo: 'puesto_con_empleados' },
      { status: 409, statusText: 'Conflict' },
    );

    // The screen reads the code, not the status, to pick the sentence.
    expect(codigo).toBe('puesto_con_empleados');
  });

  // --- Categories ------------------------------------------------------------

  it('reads the categories with GET /catalogos/categorias', () => {
    let categorias: CategoriaCatalogo[] | undefined;
    service.categorias().subscribe((respuesta) => {
      categorias = respuesta;
    });

    const request = esperar('/categorias');
    expect(request.request.method).toBe('GET');
    request.flush({ data: [CATEGORIA] });

    expect(categorias).toEqual([CATEGORIA]);
  });

  // --- Areas -----------------------------------------------------------------

  it('reads the chart with GET /catalogos/areas', () => {
    let areas: AreaCatalogo[] | undefined;
    service.areas().subscribe((respuesta) => {
      areas = respuesta;
    });

    const request = esperar('/areas');
    expect(request.request.method).toBe('GET');
    request.flush({ data: [AREA] });

    expect(areas).toEqual([AREA]);
  });

  // --- Diagnostics -----------------------------------------------------------

  it('reads the diagnostics with GET /catalogos/diagnostico, which answers flat', () => {
    let diagnostico: CatalogoDiagnostico | undefined;
    service.diagnostico().subscribe((respuesta) => {
      diagnostico = respuesta;
    });

    const request = esperar('/diagnostico');
    expect(request.request.method).toBe('GET');
    // No envelope: the counters sit at the root of the body.
    request.flush(DIAGNOSTICO);

    expect(diagnostico).toEqual(DIAGNOSTICO);
  });

  it('forwards the failure so the screen can read the code', () => {
    let codigo: string | undefined;
    service.diagnostico().subscribe({
      error: (error: { error?: { codigo?: string } }) => {
        codigo = error.error?.codigo;
      },
    });

    esperar('/diagnostico').flush(
      { mensaje: 'No autorizado.', codigo: 'permiso_denegado' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(codigo).toBe('permiso_denegado');
  });
});
