import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SesionResponse } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ComunicadoDto, SegmentacionResumen } from '../../core/mensajeria/mensajeria.models';
import { MensajeriaService } from '../../core/mensajeria/mensajeria.service';
import { MensajeriaPage } from './mensajeria-page.component';

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

const RESUMEN_MOCK: SegmentacionResumen = {
  total_activos: 42,
  areas: [{ id: 1, nombre: 'Recursos Humanos', count: 12 }],
  categorias_cct: [
    { tipo: 'administrativo', nombre: 'Administrativos', count: 15 },
    { tipo: 'docente', nombre: 'Docentes', count: 20 },
    { tipo: 'mando_medio_superior', nombre: 'Mandos Medios y Superiores (MMyS)', count: 7 },
  ],
};

function crearComunicadoMock(overrides: Partial<ComunicadoDto> = {}): ComunicadoDto {
  return {
    id: 10,
    folio: 'AUT-2026-0001',
    asunto: 'Aviso importante',
    contenido_html: '<p>Hola {{nombre_empleado}}</p>',
    modo_destinatarios: 'todos',
    filtros_json: { area_ids: [], categorias_tipo: [], empleado_ids_extra: [] },
    status: 'RECHAZADO',
    status_etiqueta: 'Rechazado',
    es_editable: true,
    total_destinatarios: 42,
    enviados: 0,
    fallidos: 0,
    feedback_rechazo: 'Falta adjuntar oficio firmado.',
    autor: { usuario_id: 2, nombre: 'Secretaría Prueba' },
    autorizador: null,
    archivos: [],
    fecha_creacion: '2026-11-17T12:00:00Z',
    fecha_solicitud: '2026-11-17T12:05:00Z',
    fecha_resolucion: null,
    fecha_completado: null,
    ...overrides,
  };
}

describe('MensajeriaPage', () => {
  let httpMock: HttpTestingController;
  let sesionSignal = signal<SesionResponse | null>(null);
  let queryParamsSubject: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    patchDialogPrototype();
    queryParamsSubject = new BehaviorSubject<ParamMap>(convertToParamMap({}));
    sesionSignal = signal<SesionResponse | null>({
      usuario_id: 2,
      empleado_id: 20,
      nombre: 'Secretaría Prueba',
      rol: 'SECRETARIA',
    });

    await TestBed.configureTestingModule({
      imports: [MensajeriaPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: queryParamsSubject.asObservable() },
        },
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

  function flushInitialLoads(): ComponentFixture<MensajeriaPage> {
    const fixture = TestBed.createComponent(MensajeriaPage);
    fixture.detectChanges();

    httpMock.expectOne(`${URL_BASE}/segmentacion/resumen`).flush(RESUMEN_MOCK);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra variables en lenguaje natural y adapta el botón primario según el rol', () => {
    const fixture = flushInitialLoads();
    const host = fixture.nativeElement as HTMLElement;
    const primaryBtn = () =>
      host.querySelector<HTMLButtonElement>('.actions-card app-button[variant="primary"] button');

    expect(host.textContent).toContain('Nombre completo');
    expect(host.textContent).toContain('Tipo de personal');
    expect(host.textContent).toContain('Área o departamento');
    expect(host.textContent).toContain('Número de empleado');
    expect(host.textContent).not.toContain('{{nombre_empleado}}');

    expect(primaryBtn()?.textContent?.trim()).toBe('Pedir Autorización');

    sesionSignal.set({
      usuario_id: 1,
      empleado_id: 10,
      nombre: 'Sistemas UTN',
      rol: 'SISTEMAS',
    });
    fixture.detectChanges();

    expect(primaryBtn()?.textContent?.trim()).toBe('Enviar Comunicado');
  });

  it('marca el botón de formato activo en la barra del editor', () => {
    const fixture = flushInitialLoads();
    const host = fixture.nativeElement as HTMLElement;

    fixture.componentInstance.boldActive.set(true);
    fixture.detectChanges();

    const boldBtn = host.querySelector<HTMLButtonElement>('.editor-toolbar button[title="Negrita"]');
    expect(boldBtn?.classList.contains('is-active')).toBe(true);
    expect(boldBtn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('carga un comunicado rechazado en el editor mostrando el feedback y fichas legibles', () => {
    const fixture = flushInitialLoads();
    const rechazado = crearComunicadoMock();

    fixture.componentInstance.aplicarComunicadoEnEditor(rechazado);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Corrección de comunicado rechazado');
    expect(host.textContent).toContain('Falta adjuntar oficio firmado.');
    expect(fixture.componentInstance.bodyHtml()).toContain('Nombre completo');
  });

  it('evita perder el foco del editor al presionar mousedown en botones de formato', () => {
    const fixture = flushInitialLoads();
    const host = fixture.nativeElement as HTMLElement;
    const italicBtn = host.querySelector<HTMLButtonElement>('.editor-toolbar button[title="Cursiva"]');
    expect(italicBtn).not.toBeNull();

    const mousedown = new MouseEvent('mousedown', { cancelable: true });
    italicBtn!.dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);
  });

  it('reinicia a un correo nuevo al quitar ?borrador o al solicitar nuevo correo desde el menú', () => {
    const fixture = flushInitialLoads();

    queryParamsSubject.next(convertToParamMap({ borrador: '10' }));
    httpMock
      .expectOne(`${URL_BASE}/comunicados/10`)
      .flush({ comunicado: crearComunicadoMock() });
    fixture.detectChanges();

    expect(fixture.componentInstance.comunicadoId()).toBe(10);
    expect(fixture.componentInstance.subject()).toBe('Aviso importante');

    queryParamsSubject.next(convertToParamMap({}));
    fixture.detectChanges();

    expect(fixture.componentInstance.comunicadoId()).toBeNull();
    expect(fixture.componentInstance.subject()).toBe('');
    expect(fixture.componentInstance.bodyHtml()).toBe('');

    fixture.componentInstance.aplicarComunicadoEnEditor(crearComunicadoMock());
    expect(fixture.componentInstance.comunicadoId()).toBe(10);

    TestBed.inject(MensajeriaService).solicitarNuevoCorreo();
    fixture.detectChanges();

    expect(fixture.componentInstance.comunicadoId()).toBeNull();
    expect(fixture.componentInstance.subject()).toBe('');
  });

  it('muestra el límite de 2 MB y permite expandir los correos destinatarios sin modal', () => {
    const fixture = flushInitialLoads();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('0.00 MB / 2.00 MB');

    fixture.componentInstance.destinatariosPreview.set([
      {
        empleado_id: 7,
        correo_destino: 'ana.perez@utn.edu.mx',
        nombre_destino: 'Ana Pérez',
        area_nombre: 'Recursos Humanos',
        categoria_nombre: 'Administrativos',
        numero_empleado: 'EMP-07',
      },
    ]);
    fixture.detectChanges();

    const toggleBtn = host.querySelector<HTMLButtonElement>('.recipients-toggle-row button');
    expect(toggleBtn?.textContent).toContain('Ver correos (42)');
    toggleBtn?.click();
    fixture.detectChanges();

    expect(host.textContent).toContain('ana.perez@utn.edu.mx');
  });

  it('muestra la barra de verificación de enlace al seleccionar un hipervínculo del editor', () => {
    const fixture = flushInitialLoads();
    const host = fixture.nativeElement as HTMLElement;
    const editor = host.querySelector<HTMLDivElement>('.rich-editor');
    expect(editor).not.toBeNull();

    editor!.innerHTML = '<p><a href="https://utn.edu.mx" target="_blank">Portal</a></p>';
    const anchor = editor!.querySelector('a')!;
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('.active-link-bar')?.textContent).toContain('https://utn.edu.mx');
  });

  it('abre la vista previa del correo dentro de un drawer lateral', () => {
    const fixture = flushInitialLoads();
    const host = fixture.nativeElement as HTMLElement;

    fixture.componentInstance.subject.set('[AVISO] Prueba');
    fixture.componentInstance.bodyHtml.set('<p>Hola {{nombre_empleado}}</p><img src="https://example.com/flyer.png" alt="Flyer" />');
    fixture.componentInstance.abrirVistaPrevia();
    fixture.detectChanges();

    expect(fixture.componentInstance.previewDrawerOpen()).toBe(true);
    const drawerDialog = host.querySelector<HTMLDialogElement>('app-drawer dialog');
    expect(drawerDialog?.hasAttribute('open')).toBe(true);
    expect(drawerDialog?.querySelector('.mail-preview-body img')).not.toBeNull();
    expect(drawerDialog?.textContent).toContain('Comunicado Institucional');
    expect(drawerDialog?.textContent).toContain('Este mensaje fue enviado de manera automática');
  });

  it('permite alinear imágenes en el editor desde la barra de formato', () => {
    const fixture = flushInitialLoads();
    const host = fixture.nativeElement as HTMLElement;
    const editor = host.querySelector<HTMLDivElement>('.rich-editor')!;

    editor.innerHTML = '<img src="https://example.com/flyer.png" data-att-id="4" class="embedded-mail-img">';
    const img = editor.querySelector('img')!;
    img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    const centerBtn = host.querySelector<HTMLButtonElement>('.editor-toolbar button[title="Centrar"]')!;
    const rightBtn = host.querySelector<HTMLButtonElement>('.editor-toolbar button[title="Alinear a la derecha"]')!;
    expect(centerBtn).not.toBeNull();
    expect(rightBtn).not.toBeNull();

    centerBtn.click();
    fixture.detectChanges();
    expect(img.getAttribute('data-align')).toBe('center');
    expect(fixture.componentInstance.alignCenterActive()).toBe(true);

    rightBtn.click();
    fixture.detectChanges();
    expect(img.getAttribute('data-align')).toBe('right');
    expect(fixture.componentInstance.alignRightActive()).toBe(true);
  });
});
