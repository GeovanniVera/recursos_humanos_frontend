import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ResumenDashboard } from './dashboard.models';
import { DashboardService } from './dashboard.service';

const URL_RESUMEN = `${environment.apiBaseUrl}/dashboard/resumen`;

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('asks GET /dashboard/resumen without params or body', () => {
    service.cargarResumen().subscribe();

    const request = httpMock.expectOne(URL_RESUMEN);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().length).toBe(0);
    expect(request.request.body).toBeNull();

    request.flush({ datos: { empleados_activos: 10, empleados_baja: 2, expedientes_completos: 4 } });
  });

  it('unwraps `datos` and hands the counters to the caller', () => {
    let recibido: ResumenDashboard | undefined;
    service.cargarResumen().subscribe((resumen) => {
      recibido = resumen;
    });

    httpMock
      .expectOne(URL_RESUMEN)
      .flush({ datos: { empleados_activos: 10, empleados_baja: 2, expedientes_completos: 4 } });

    // The envelope is the wire format; the screen never sees it.
    expect(recibido).toEqual({
      empleados_activos: 10,
      empleados_baja: 2,
      expedientes_completos: 4,
    });
  });

  it('forwards the failure so the screen can decide what to show', () => {
    let estado: number | undefined;
    service.cargarResumen().subscribe({
      error: (error: { status?: number }) => {
        estado = error.status;
      },
    });

    httpMock
      .expectOne(URL_RESUMEN)
      .flush(
        { message: 'El servicio no está disponible.', codigo: 'servicio_no_disponible' },
        { status: 503, statusText: 'Service Unavailable' },
      );

    expect(estado).toBe(503);
  });
});
