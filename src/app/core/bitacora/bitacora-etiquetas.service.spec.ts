import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FormularioCatalogos } from '../empleados/alta.models';
import { FichaEmpleado } from '../empleados/ficha.models';
import {
  BitacoraEtiquetasService,
  claveEtiqueta,
  EtiquetasSnapshot,
  URL_CATALOGOS_FORMULARIO,
} from './bitacora-etiquetas.service';
import { BitacoraDetalle } from './bitacora.models';

const URL_EMPLEADO = `${environment.apiBaseUrl}/empleados/446`;

function detalle(): BitacoraDetalle {
  return {
    id: 481,
    fecha: '2026-11-18T18:42:11+00:00',
    usuario_id: 12,
    usuario_historico: 'Ana López',
    accion: 'empleado.edicion',
    modulo: 'expediente',
    descripcion: 'Cambio de estado civil.',
    ip: '10.0.0.8',
    datos_antes: { empleado_id: 446, estatus: 'activo' },
    datos_despues: { empleado_id: 446, estado_civil_id: 4, puesto_id: 9 },
  };
}

function catalogos(): FormularioCatalogos {
  return {
    areas: [],
    puestos: [{ id: 9, nombre: 'Secretaría académica', categoria_cct_id: 1, area_ids: [] }],
    categorias_cct: [],
    niveles_estudios: [],
    estados_civiles: [{ id: 4, clave: 'D', descripcion: 'Divorciado' }],
    tipos_personal: [],
    sexos: [],
    entidades: [],
    tipos_jornada: [],
    trabaja_otro_lugar: [],
  };
}

describe('BitacoraEtiquetasService', () => {
  let service: BitacoraEtiquetasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BitacoraEtiquetasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('resuelve los IDs de los snapshots a nombres legibles', async () => {
    let resultado: EtiquetasSnapshot | undefined;
    service.cargar(detalle()).subscribe((valor) => (resultado = valor));

    http.expectOne(URL_CATALOGOS_FORMULARIO).flush(catalogos());
    http.expectOne(URL_EMPLEADO).flush({
      data: { identificacion: { nombre: 'María Rodríguez' } } as unknown as FichaEmpleado,
    });
    await Promise.resolve();

    expect(resultado?.[claveEtiqueta('empleado_id', 446)]).toBe('María Rodríguez');
    expect(resultado?.[claveEtiqueta('estado_civil_id', 4)]).toBe('Divorciado');
    expect(resultado?.[claveEtiqueta('puesto_id', 9)]).toBe('Secretaría académica');
  });

  it('no deja ver el número cuando no se puede resolver el nombre', async () => {
    let resultado: EtiquetasSnapshot | undefined;
    service.cargar(detalle()).subscribe((valor) => (resultado = valor));

    http
      .expectOne(URL_CATALOGOS_FORMULARIO)
      .flush('falló', { status: 500, statusText: 'Server Error' });
    http.expectOne(URL_EMPLEADO).flush('no existe', { status: 404, statusText: 'Not Found' });
    await Promise.resolve();

    expect(resultado?.[claveEtiqueta('empleado_id', 446)]).toBe('Empleado (sin nombre disponible)');
    expect(resultado?.[claveEtiqueta('estado_civil_id', 4)]).toBe(
      'Estado civil (sin nombre disponible)',
    );
  });

  it('no pide catálogos cuando el detalle no tiene IDs', async () => {
    const sinIds: BitacoraDetalle = {
      ...detalle(),
      usuario_id: null,
      datos_antes: null,
      datos_despues: null,
    };
    let resultado: EtiquetasSnapshot | undefined;
    service.cargar(sinIds).subscribe((valor) => (resultado = valor));
    await Promise.resolve();

    expect(resultado).toEqual({});
    http.expectNone(URL_CATALOGOS_FORMULARIO);
  });
});
