import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import {
  AltaEmpleadoRequest,
  EmpleadoRegistrado,
  FormularioCatalogos,
} from './alta.models';
import { AltaService } from './alta.service';

const URL_EMPLEADOS = `${environment.apiBaseUrl}/empleados`;
const URL_FORMULARIO = `${URL_EMPLEADOS}/formulario`;

/** `200` body of the catalog endpoint, straight from the contract. */
const CATALOGOS: FormularioCatalogos = {
  areas: [
    {
      id: 1,
      padre_id: null,
      nombre: 'Rectoría',
      tipo_area: 'Dirección',
      naturaleza: 'Sustantiva',
      orden: 1,
      asignable: false,
    },
  ],
  puestos: [{ id: 7, nombre: 'Analista', categoria_cct_id: 3, area_ids: [3] }],
  categorias_cct: [
    { id: 3, clave: 'CCT-01', tipo: 'mando_medio_superior', descripcion: 'Analista' },
  ],
  niveles_estudios: [{ id: 2, clave: 'LIC', descripcion: 'Licenciatura' }],
  estados_civiles: [{ id: 1, clave: 'SOL', descripcion: 'Soltero' }],
  tipos_personal: ['No Aplica', 'Sindicalizado', 'No sindicalizado'],
  sexos: ['Masculino', 'Femenino'],
  municipios: [{ id: 5, nombre: 'Nezahualcóyotl', entidad: 'México' }],
  tipos_jornada: ['Matutina', 'Vespertina', 'Mixta'],
  trabaja_otro_lugar: ['No', 'Publico', 'Privado'],
};

/** Smallest body the endpoint accepts: the six required fields. */
const ALTA_MINIMA: AltaEmpleadoRequest = {
  num_empleado: '12345',
  nombre: 'Ana Martínez',
  area_id: 4,
  puesto_id: 7,
  fecha_inicio_puesto: '2026-01-15',
  correo_institucional: 'ana@utn.edu.mx',
};

const REGISTRADO: EmpleadoRegistrado = {
  id: 42,
  num_empleado: '12345',
  nombre: 'Ana Martínez',
  correo_institucional: 'ana@utn.edu.mx',
  activo: true,
};

describe('AltaService', () => {
  let service: AltaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AltaService);
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

  it('asks GET /empleados/formulario for the catalogs', () => {
    service.cargarCatalogos().subscribe();

    const request = esperar(URL_FORMULARIO);
    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();
    expect(request.request.params.keys().length).toBe(0);

    request.flush(CATALOGOS);
  });

  it('hands the catalogs over as they arrive, without unwrapping anything', () => {
    let recibido: FormularioCatalogos | undefined;
    service.cargarCatalogos().subscribe((catalogos) => {
      recibido = catalogos;
    });

    esperar(URL_FORMULARIO).flush(CATALOGOS);

    // This endpoint does not wrap its body in `data`: the catalogs are at the
    // root, and every one of the nine keys belongs to the contract.
    expect(recibido).toEqual(CATALOGOS);
  });

  it('posts only the fields it was given and returns the created record', () => {
    let creado: EmpleadoRegistrado | undefined;
    service.registrar(ALTA_MINIMA).subscribe((empleado) => {
      creado = empleado;
    });

    const request = esperar(URL_EMPLEADOS);
    expect(request.request.method).toBe('POST');
    // Nothing is added: an empty optional field is not sent, and a field the
    // backend prohibits is never filled in here.
    expect(request.request.body).toEqual(ALTA_MINIMA);

    request.flush(REGISTRADO, { status: 201, statusText: 'Created' });

    expect(creado).toEqual(REGISTRADO);
  });

  it('forwards the validation failure so the screen can map it per field', () => {
    let estado: number | undefined;
    let cuerpo: unknown;

    service.registrar(ALTA_MINIMA).subscribe({
      error: (error: { status?: number; error?: unknown }) => {
        estado = error.status;
        cuerpo = error.error;
      },
    });

    const errores = { correo_institucional: ['El correo debe ser institucional.'] };
    esperar(URL_EMPLEADOS).flush(
      { message: 'Los datos no son válidos.', errors: errores },
      { status: 422, statusText: 'Unprocessable Content' },
    );

    expect(estado).toBe(422);
    expect(cuerpo).toEqual({ message: 'Los datos no son válidos.', errors: errores });
  });
});
