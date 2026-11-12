import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { BajaEmpleadoRequest, BajaEmpleadoResponse, MotivoBaja } from './baja.models';
import { BajaService } from './baja.service';

const URL_MOTIVOS = `${environment.apiBaseUrl}/catalogos/motivos-baja`;
const URL_BAJA = `${environment.apiBaseUrl}/empleados/7/baja`;

/** `200` body of the catalog endpoint, straight from the contract. */
const MOTIVOS: readonly MotivoBaja[] = [
  { id: 1, clave: 'BAJA_DEFINITIVA', descripcion: 'Baja definitiva' },
  { id: 4, clave: 'BAJA_TEMPORAL', descripcion: 'Baja temporal' },
];

/** Smallest body the endpoint accepts: the motive and the note. */
const BAJA: BajaEmpleadoRequest = {
  motivo_id: 4,
  nota: 'Licencia por incapacidad',
};

const RESPUESTA: BajaEmpleadoResponse = {
  mensaje: 'Baja procesada exitosamente.',
  empleado: {
    id: 7,
    num_empleado: 'UTN-SEC-01',
    nombre: 'Ana Martínez',
    activo: false,
    fecha_baja: '2026-11-11',
    motivo_baja: 'Baja temporal',
    nota_baja: 'Licencia por incapacidad',
    baja_por: 1,
  },
};

describe('BajaService', () => {
  let service: BajaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BajaService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  /** The single request in flight, matched on its URL only. */
  function esperar(url: string): TestRequest {
    return httpMock.expectOne((peticion) => peticion.url === url);
  }

  it('asks GET /catalogos/motivos-baja for the motives', () => {
    service.cargarMotivos().subscribe();

    const request = esperar(URL_MOTIVOS);
    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();
    expect(request.request.params.keys().length).toBe(0);

    request.flush({ data: MOTIVOS });
  });

  it('unwraps the list from `data`', () => {
    let recibidos: readonly MotivoBaja[] | undefined;
    service.cargarMotivos().subscribe((motivos) => {
      recibidos = motivos;
    });

    esperar(URL_MOTIVOS).flush({ data: MOTIVOS });

    // The screen renders options; the envelope is none of its business.
    expect(recibidos).toEqual(MOTIVOS);
    expect(Array.isArray(recibidos)).toBe(true);
  });

  it('posts exactly `motivo_id` and `nota` to the baja of the employee', () => {
    let recibida: BajaEmpleadoResponse | undefined;
    service.darDeBaja(7, BAJA).subscribe((respuesta) => {
      recibida = respuesta;
    });

    const request = esperar(URL_BAJA);
    expect(request.request.method).toBe('POST');
    // Nothing is added: the date and the actor are the server's, and any of the
    // aliases of the motive would come back as a `422`.
    expect(request.request.body).toEqual({ motivo_id: 4, nota: 'Licencia por incapacidad' });
    expect(Object.keys(request.request.body as object)).toEqual(['motivo_id', 'nota']);

    request.flush(RESPUESTA);

    expect(recibida).toEqual(RESPUESTA);
  });

  it('forwards the conflict of an already terminated worker', () => {
    let estado: number | undefined;
    let cuerpo: unknown;

    service.darDeBaja(7, BAJA).subscribe({
      error: (error: { status?: number; error?: unknown }) => {
        estado = error.status;
        cuerpo = error.error;
      },
    });

    esperar(URL_BAJA).flush(
      { mensaje: 'El trabajador ya está dado de baja.', codigo: 'trabajador_ya_inactivo' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(estado).toBe(409);
    expect(cuerpo).toEqual({
      mensaje: 'El trabajador ya está dado de baja.',
      codigo: 'trabajador_ya_inactivo',
    });
  });
});
