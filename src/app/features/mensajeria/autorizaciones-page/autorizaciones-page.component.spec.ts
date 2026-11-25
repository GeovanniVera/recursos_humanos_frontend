import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { SesionResponse } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { ComunicadoDto } from '../../../core/mensajeria/mensajeria.models';
import { AutorizacionesPage } from './autorizaciones-page.component';

const URL_BASE = `${environment.apiBaseUrl}/mensajeria`;

function patchDialogPrototype(): void {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal: () => void;
    close: () => void;
  };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

const PENDIENTE: ComunicadoDto = {
  id: 10,
  folio: 'AUT-2026-0001',
  asunto: 'Aviso importante',
  contenido_html: '<p>Cuerpo del mensaje</p>',
  modo_destinatarios: 'todos',
  filtros_json: { area_ids: [], categorias_tipo: [], empleado_ids_extra: [] },
  status: 'PEND_AUT',
  status_etiqueta: 'Pendiente de autorización',
  es_editable: false,
  total_destinatarios: 25,
  enviados: 0,
  fallidos: 0,
  feedback_rechazo: null,
  autor: { usuario_id: 2, nombre: 'Secretaría Prueba' },
  autorizador: null,
  archivos: [],
  fecha_creacion: '2026-11-17T12:00:00Z',
  fecha_solicitud: '2026-11-17T12:05:00Z',
  fecha_resolucion: null,
  fecha_completado: null,
};

describe('AutorizacionesPage', () => {
  let httpMock: HttpTestingController;
  let sesionSignal = signal<SesionResponse | null>(null);

  beforeEach(async () => {
    patchDialogPrototype();
    sesionSignal = signal<SesionResponse | null>({
      usuario_id: 1,
      empleado_id: 10,
      nombre: 'Super Admin',
      rol: 'SUPER_ADMIN',
    });

    await TestBed.configureTestingModule({
      imports: [AutorizacionesPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            sesion: sesionSignal.asReadonly(),
            rol: () => sesionSignal()?.rol ?? null,
          },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  function flushList(items: ComunicadoDto[]): ComponentFixture<AutorizacionesPage> {
    const fixture = TestBed.createComponent(AutorizacionesPage);
    fixture.detectChanges();

    httpMock
      .expectOne(`${URL_BASE}/comunicados?pagina=1&por_pagina=20&estatus=pendientes`)
      .flush({
        comunicados: items,
        conteos: { pendientes: items.length, aprobados: 0, rechazados: 0, borradores: 0 },
        meta: { current_page: 1, last_page: 1, per_page: 20, total: items.length },
      });
    fixture.detectChanges();
    return fixture;
  }

  it('abre el drawer de vista previa al hacer clic en una fila y permite aprobar a SUPER_ADMIN', () => {
    const fixture = flushList([PENDIENTE]);
    const host = fixture.nativeElement as HTMLElement;

    const row = host.querySelector<HTMLTableRowElement>('tbody tr');
    row?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.drawerOpen()).toBe(true);
    expect(host.querySelector('app-drawer dialog')?.textContent).toContain('Aprobar y Enviar');

    fixture.componentInstance.aprobar(PENDIENTE);
    httpMock.expectOne(`${URL_BASE}/comunicados/10/aprobar`).flush({
      mensaje: 'Aprobado',
      comunicado: { ...PENDIENTE, status: 'EN_COLA', status_etiqueta: 'En cola de envío' },
    });
    httpMock
      .expectOne(`${URL_BASE}/comunicados?pagina=1&por_pagina=20&estatus=pendientes`)
      .flush({
        comunicados: [],
        conteos: { pendientes: 0, aprobados: 1, rechazados: 0, borradores: 0 },
        meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
      });
  });
});
