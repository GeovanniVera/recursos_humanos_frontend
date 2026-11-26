import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { HistorialEnviosPage } from './historial-page.component';

const COMUNICADO_PARCIAL = {
  id: 42,
  folio: 'RH-2026-0042',
  asunto: 'Aviso importante de nómina',
  contenido_html: '<p>Estimado {{nombre_empleado}}</p>',
  modo_destinatarios: 'todos' as const,
  filtros_json: { area_ids: [], categorias_tipo: [], empleado_ids_extra: [] },
  status: 'ENVIADO_PARCIAL' as const,
  status_etiqueta: 'Enviado parcial',
  es_editable: false,
  total_destinatarios: 2,
  enviados: 1,
  fallidos: 1,
  feedback_rechazo: null,
  autor: { usuario_id: 1, nombre: 'Laura RH' },
  autorizador: { usuario_id: 2, nombre: 'Director UTN' },
  archivos: [],
  fecha_creacion: '2026-11-24T10:00:00Z',
  fecha_solicitud: '2026-11-24T10:05:00Z',
  fecha_resolucion: '2026-11-24T10:15:00Z',
  fecha_completado: '2026-11-24T10:20:00Z',
};

describe('HistorialEnviosPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistorialEnviosPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('carga el historial, muestra detalle de destinatarios y permite reintentar fallidos a un autorizador', async () => {
    const auth = TestBed.inject(AuthService);
    auth.cargarSesion().subscribe();
    httpMock
      .expectOne((req) => req.url.endsWith('/auth/sesion'))
      .flush({ usuario_id: 2, empleado_id: 20, nombre: 'Director UTN', rol: 'SUPER_ADMIN' });

    const fixture = TestBed.createComponent(HistorialEnviosPage);
    fixture.detectChanges();

    const listReq = httpMock.expectOne(
      (req) =>
        req.url.endsWith('/mensajeria/comunicados') &&
        req.params.get('estatus') === 'historial',
    );
    listReq.flush({
      comunicados: [COMUNICADO_PARCIAL],
      conteos: {
        pendientes: 0,
        aprobados: 1,
        rechazados: 0,
        borradores: 0,
        historial: 1,
        historial_completados: 0,
        historial_en_progreso: 0,
        historial_con_fallos: 1,
      },
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('RH-2026-0042');
    expect(host.textContent).toContain('Aviso importante de nómina');

    const link = host.querySelector<HTMLButtonElement>('app-row-link button');
    link?.click();
    fixture.detectChanges();

    const destReq = httpMock.expectOne(
      (req) =>
        req.url.endsWith('/mensajeria/comunicados/42/destinatarios') &&
        req.params.get('status') === 'FALLIDO',
    );
    destReq.flush({
      destinatarios: [
        {
          id: 901,
          empleado_id: 50,
          correo_destino: 'fallido@utn.edu.mx',
          nombre_destino: 'Carlos Fallo',
          area_nombre: 'Finanzas',
          categoria_nombre: 'Administrativos',
          numero_empleado: 'EMP-50',
          status: 'FALLIDO',
          status_etiqueta: 'Fallido',
          error_detalle: 'SMTP timeout',
          fecha_envio: null,
        },
      ],
      conteos: { total: 2, pendientes: 0, enviados: 1, fallidos: 1 },
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toContain('fallido@utn.edu.mx');
    expect(bodyText).toContain('SMTP timeout');

    const retryBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Reintentar fallidos'),
    );
    expect(retryBtn).toBeTruthy();
    retryBtn?.click();
    fixture.detectChanges();

    const retryReq = httpMock.expectOne((req) =>
      req.url.endsWith('/mensajeria/comunicados/42/reintentar-fallidos'),
    );
    expect(retryReq.request.method).toBe('POST');
    retryReq.flush({
      mensaje: 'Reintento de destinatarios fallidos encolado correctamente.',
      comunicado: { ...COMUNICADO_PARCIAL, status: 'EN_COLA', status_etiqueta: 'En cola', fallidos: 0 },
    });

    httpMock
      .expectOne((req) => req.url.endsWith('/mensajeria/comunicados/42/destinatarios'))
      .flush({
        destinatarios: [],
        conteos: { total: 2, pendientes: 1, enviados: 1, fallidos: 0 },
        meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
      });

    httpMock
      .expectOne(
        (req) =>
          req.url.endsWith('/mensajeria/comunicados') &&
          req.params.get('estatus') === 'historial',
      )
      .flush({
        comunicados: [{ ...COMUNICADO_PARCIAL, status: 'EN_COLA', status_etiqueta: 'En cola', fallidos: 0 }],
        conteos: {
          pendientes: 0,
          aprobados: 1,
          rechazados: 0,
          borradores: 0,
          historial: 1,
          historial_completados: 0,
          historial_en_progreso: 1,
          historial_con_fallos: 0,
        },
        meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
      });

    await fixture.whenStable();
  });

  it('muestra estado Expirada / Eliminada sin descarga para imágenes vencidas en el historial', async () => {
    const auth = TestBed.inject(AuthService);
    auth.cargarSesion().subscribe();
    httpMock
      .expectOne((req) => req.url.endsWith('/auth/sesion'))
      .flush({ usuario_id: 2, empleado_id: 20, nombre: 'Director UTN', rol: 'SUPER_ADMIN' });

    const fixture = TestBed.createComponent(HistorialEnviosPage);
    fixture.detectChanges();

    httpMock
      .expectOne(
        (req) =>
          req.url.endsWith('/mensajeria/comunicados') &&
          req.params.get('estatus') === 'historial',
      )
      .flush({
        comunicados: [
          {
            ...COMUNICADO_PARCIAL,
            status: 'COMPLET',
            status_etiqueta: 'Enviado',
            fallidos: 0,
            archivos: [
              {
                id: 88,
                comunicado_id: 42,
                uuid: '01950000-0000-7000-8000-000000000088',
                nombre_original: 'banner-viejo.png',
                mime_type: 'image/png',
                tamano_bytes: 12000,
                es_imagen: true,
                embebido_en_cuerpo: true,
                estado: 'ELIMINADO',
                esta_disponible: false,
                expira_en: '2026-10-24T10:20:00Z',
                eliminado_en: '2026-10-25T00:00:00Z',
                url_descarga: '/api/mensajeria/comunicados/42/adjuntos/88',
                url_publica: 'https://rh.utn.edu.mx/api/medios/01950000-0000-7000-8000-000000000088.png',
                fecha_subida: '2026-09-24T10:00:00Z',
              },
            ],
          },
        ],
        conteos: {
          pendientes: 0,
          aprobados: 1,
          rechazados: 0,
          borradores: 0,
          historial: 1,
          historial_completados: 1,
          historial_en_progreso: 0,
          historial_con_fallos: 0,
        },
        meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
      });

    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('app-row-link button')?.click();
    fixture.detectChanges();

    httpMock
      .expectOne((req) => req.url.endsWith('/mensajeria/comunicados/42/destinatarios'))
      .flush({
        destinatarios: [],
        conteos: { total: 2, pendientes: 0, enviados: 2, fallidos: 0 },
        meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
      });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.body.querySelector('.attach-expired')?.textContent).toContain('banner-viejo.png');
    expect(document.body.querySelector('.attach-expired')?.textContent).toContain('Expirada / Eliminada');
    expect(document.body.querySelector('.attach-btn')).toBeNull();
  });
});
