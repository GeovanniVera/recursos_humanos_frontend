import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AnaliticaDashboard } from '../../core/dashboard/dashboard.models';
import { DashboardPage } from './dashboard-page.component';

const URL_RESUMEN = `${environment.apiBaseUrl}/dashboard/resumen`;
const URL_ANALITICA = `${environment.apiBaseUrl}/dashboard/analitica`;

const RESUMEN = { empleados_activos: 10, empleados_baja: 2, expedientes_completos: 4 };

const ANALITICA: AnaliticaDashboard = {
  plantilla: {
    activos: 10,
    en_licencia: 1,
    bajas_definitivas: 2,
    porcentaje_completitud: 40,
    con_empleo_externo_vigente: 3,
    antiguedad_promedio_anios: 4.5,
    top_areas: [{ etiqueta: 'Sistemas', total: 6 }],
    por_categoria_cct: [{ etiqueta: 'Base', total: 8 }],
    por_tipo_personal: [{ etiqueta: 'Sindicalizado', total: 7 }],
    por_jornada: [{ etiqueta: 'Matutina', total: 10 }],
    por_sexo: [{ etiqueta: 'Femenino', total: 5 }],
  },
  semaforo: {
    completos: 4,
    casi_completos: 3,
    incompletos: 3,
    sin_curp: 1,
    sin_grado_maximo: 2,
    por_nivel_estudios: [{ etiqueta: 'Licenciatura', total: 6 }],
  },
  movimientos: {
    altas_mes: 2,
    bajas_mes: 1,
    cambios_adscripcion_90d: 1,
    motivos_baja: [{ etiqueta: 'Renuncia', total: 1 }],
    serie_mensual: [{ mes: '2026-11', altas: 2, bajas: 1 }],
  },
  comunicacion: {
    pendientes_autorizacion: 1,
    enviados_mes: 5,
    destinatarios_mes: 50,
    por_estatus: [{ etiqueta: 'Enviado', total: 5 }],
  },
  seguridad: null,
};

function host(fixture: ComponentFixture<DashboardPage>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: ComponentFixture<DashboardPage>): string {
  return host(fixture).textContent ?? '';
}

function miniKpis(fixture: ComponentFixture<DashboardPage>): { label: string; value: string }[] {
  return Array.from(host(fixture).querySelectorAll('.mini-kpi')).map((el) => ({
    label: el.querySelector('.mini-label')?.textContent?.trim() ?? '',
    value: el.querySelector('.mini-val')?.textContent?.trim() ?? '',
  }));
}

function actionButton(
  fixture: ComponentFixture<DashboardPage>,
  label: string,
): HTMLButtonElement | undefined {
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    (button.textContent ?? '').includes(label),
  );
}

describe('DashboardPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    for (const req of httpMock.match(URL_ANALITICA)) {
      req.flush({ datos: null });
    }
    try {
      httpMock.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  async function render(): Promise<ComponentFixture<DashboardPage>> {
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    return fixture;
  }

  it('renders the plantilla KPIs and omits antigüedad promedio and completitud documental', async () => {
    const fixture = await render();

    httpMock.expectOne(URL_RESUMEN).flush({ datos: RESUMEN });
    httpMock.expectOne(URL_ANALITICA).flush({ datos: ANALITICA });
    await fixture.whenStable();

    expect(miniKpis(fixture)).toEqual([
      { label: 'Activos', value: '10' },
      { label: 'Bajas definitivas', value: '2' },
      { label: 'En licencia', value: '1' },
      { label: 'Con empleo externo', value: '3' },
    ]);
    expect(text(fixture)).not.toContain('Antigüedad promedio');
    expect(text(fixture)).not.toContain('Completitud documental');
    expect(host(fixture).querySelector('app-kpi-card')).toBeNull();
  });

  it('announces itself as busy while loading', async () => {
    const fixture = await render();

    const busyRegion = host(fixture).querySelector('[aria-busy="true"]');
    expect(busyRegion).not.toBeNull();
    expect(text(fixture)).toContain('Cargando indicadores del panel');

    httpMock.expectOne(URL_RESUMEN).flush({ datos: RESUMEN });
    httpMock.expectOne(URL_ANALITICA).flush({ datos: ANALITICA });
    await fixture.whenStable();

    expect(host(fixture).querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('offers a retry when the service is unavailable, and the retry refetches', async () => {
    const fixture = await render();

    httpMock
      .expectOne(URL_RESUMEN)
      .flush(
        { message: 'El servicio no está disponible.', codigo: 'servicio_no_disponible' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    await fixture.whenStable();

    expect(text(fixture)).toContain('El servicio no está disponible. Reintenta en unos segundos.');

    actionButton(fixture, 'Reintentar')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_RESUMEN).flush({ datos: RESUMEN });
    httpMock.expectOne(URL_ANALITICA).flush({ datos: ANALITICA });
    await fixture.whenStable();

    expect(miniKpis(fixture)[0]).toEqual({ label: 'Activos', value: '10' });
  });

  it('explains a permission failure and shows the contract code', async () => {
    const fixture = await render();

    httpMock
      .expectOne(URL_RESUMEN)
      .flush(
        { message: 'Permiso denegado.', codigo: 'permiso_denegado' },
        { status: 403, statusText: 'Forbidden' },
      );
    await fixture.whenStable();

    expect(text(fixture)).toContain('No tienes permisos para ver el panel.');
    expect(text(fixture)).toContain('permiso_denegado');
    expect(actionButton(fixture, 'Reintentar')).toBeUndefined();
    expect(host(fixture).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('sends the user back to the login when the session expired', async () => {
    sessionStorage.setItem('utn-rh.token', 'token-vencido');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = await render();
    httpMock
      .expectOne(URL_RESUMEN)
      .flush({ message: 'No autenticado.' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    expect(text(fixture)).toContain('Tu sesión venció. Vuelve a iniciar sesión.');

    actionButton(fixture, 'Iniciar sesión')?.click();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(sessionStorage.getItem('utn-rh.token')).toBeNull();
  });

  it('blames the connection when the request never reached the server', async () => {
    const fixture = await render();

    httpMock.expectOne(URL_RESUMEN).error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();

    expect(text(fixture)).toContain('No pudimos conectar con el servidor. Revisa tu conexión.');
    expect(actionButton(fixture, 'Reintentar')).toBeDefined();
  });

  it('switches between analytics tabs and hides Seguridad when null', async () => {
    const fixture = await render();
    httpMock.expectOne(URL_RESUMEN).flush({ datos: RESUMEN });
    httpMock.expectOne(URL_ANALITICA).flush({ datos: ANALITICA });
    await fixture.whenStable();

    expect(actionButton(fixture, 'Seguridad y auditoría')).toBeUndefined();

    actionButton(fixture, 'Semáforo y formación')?.click();
    await fixture.whenStable();

    expect(text(fixture)).toContain('Proporción del semáforo');
    expect(text(fixture)).toContain('Completos');
  });
});
