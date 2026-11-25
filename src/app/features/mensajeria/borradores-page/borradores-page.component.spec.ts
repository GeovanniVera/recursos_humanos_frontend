import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { BorradoresPage } from './borradores-page.component';

const URL_BASE = `${environment.apiBaseUrl}/mensajeria`;

describe('BorradoresPage', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BorradoresPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('lista los borradores propios y abre el editor al hacer clic en la fila', () => {
    const fixture = TestBed.createComponent(BorradoresPage);
    fixture.detectChanges();

    httpMock
      .expectOne(`${URL_BASE}/comunicados?pagina=1&por_pagina=20&estatus=borradores`)
      .flush({
        comunicados: [
          {
            id: 77,
            folio: null,
            asunto: 'Borrador quincenal',
            contenido_html: '<p>Avance</p>',
            modo_destinatarios: 'todos',
            filtros_json: { area_ids: [], categorias_tipo: [], empleado_ids_extra: [] },
            status: 'BORR',
            status_etiqueta: 'Borrador',
            es_editable: true,
            total_destinatarios: 10,
            enviados: 0,
            fallidos: 0,
            feedback_rechazo: null,
            autor: { usuario_id: 2, nombre: 'Secretaría Prueba' },
            autorizador: null,
            archivos: [],
            fecha_creacion: '2026-11-17T12:00:00Z',
            fecha_solicitud: null,
            fecha_resolucion: null,
            fecha_completado: null,
          },
        ],
        conteos: { pendientes: 0, aprobados: 0, rechazados: 0, borradores: 1 },
        meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
      });
    fixture.detectChanges();

    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLTableRowElement>('tbody tr');
    row?.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/mensajeria'], { queryParams: { borrador: 77 } });
  });
});
