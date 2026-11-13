import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { FichaEmpleado, HistorialBaja } from './ficha.models';
import { FichaService } from './ficha.service';

const URL_FICHA = `${environment.apiBaseUrl}/empleados/12`;
const URL_HISTORIAL_BAJAS = `${URL_FICHA}/historial-bajas`;

const FICHA: FichaEmpleado = {
  id: 12,
  identificacion: {
    num_empleado: 'UTN-001',
    nombre: 'Nombre Apellido',
    curp: 'AAAA000000AAAAAA00',
    fecha_nacimiento: '1990-05-14',
    sexo: 'M',
    estado_civil_id: 2,
    estado_civil: 'Casado',
    entidad_nacimiento: 'Estado de México',
  },
  plaza: {
    area_id: 3,
    area: 'Área A',
    puesto_id: 7,
    puesto: 'Analista',
    tipo_puesto: 'Confianza',
    categoria_cct_id: 1,
    categoria_cct_clave: 'CCT-01',
    tipo_personal: 'Sindicalizado',
    tipo_jornada: 'Completa',
    fecha_inicio_puesto: '2020-01-15',
    fecha_ingreso_institucion: '2018-03-01',
    fecha_ingreso_gobierno: '2015-09-01',
    antiguedad: { anios: 7, meses: 4, dias: 12, texto: '7 años, 4 meses' },
  },
  contacto: { correo_institucional: 'persona@utn.edu.mx' },
  estudios: {
    nivel_estudios_id: 3,
    nivel_estudios: 'Licenciatura',
    escuela_procedencia: 'UNAM',
    generacion: '2012-2016',
  },
  experiencia: {
    exp_publico_anios: 5,
    exp_privado_anios: 3,
    trabaja_otro_lugar: 'No',
    trabaja_otro_donde: null,
  },
  gestion_interna: {
    activo: true,
    fecha_baja: null,
    motivo_baja: null,
    nota_baja: null,
    observaciones: null,
    estado_expediente: {
      estado: 'casi_completo',
      total_faltantes: 2,
      campos_faltantes: ['curp', 'entidad_nacimiento'],
    },
  },
};

describe('FichaService', () => {
  let service: FichaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FichaService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('asks GET /empleados/{id} with the internal key and no params', () => {
    service.consultar(12).subscribe();

    const request = httpMock.expectOne(URL_FICHA);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().length).toBe(0);
    expect(request.request.body).toBeNull();

    request.flush({ data: FICHA });
  });

  it('unwraps `data` and hands the record to the caller', () => {
    let received: FichaEmpleado | undefined;
    service.consultar(12).subscribe((ficha) => {
      received = ficha;
    });

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });

    // The envelope is the wire format; the drawer never sees it.
    expect(received).toEqual(FICHA);
    expect(received?.identificacion.nombre).toBe('Nombre Apellido');
  });

  it('forwards the failure so the panel can decide what to show', () => {
    let status: number | undefined;
    service.consultar(999).subscribe({
      error: (error: { status?: number }) => {
        status = error.status;
      },
    });

    httpMock
      .expectOne(`${environment.apiBaseUrl}/empleados/999`)
      .flush({ message: 'Trabajador no encontrado.' }, { status: 404, statusText: 'Not Found' });

    expect(status).toBe(404);
  });

  it('asks GET /empleados/{id}/historial-bajas and unwraps data', () => {
    const historial: HistorialBaja[] = [
      {
        id: 1,
        tipo: 'licencia',
        motivo_id: 2,
        motivo: 'Baja temporal',
        motivo_clave: 'BAJA_TEMPORAL',
        desde: '2026-04-01',
        hasta: null,
        vigente: true,
        nota: 'Licencia temporal',
        registrado_por: 'Elena Ejecutora',
        reactivado_por: null,
        nota_reactivacion: null,
        fecha_registro: '2026-04-01T10:00:00Z',
      },
    ];

    let received: HistorialBaja[] | undefined;
    service.consultarBajas(12).subscribe((rows) => {
      received = rows;
    });

    const request = httpMock.expectOne(URL_HISTORIAL_BAJAS);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().length).toBe(0);
    request.flush({ data: historial });

    expect(received).toEqual(historial);
  });
});
