import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { MotivoBaja } from '../../../core/empleados/baja.models';
import { FichaEmpleado, HistorialBaja, ResumenCompletitud } from '../../../core/empleados/ficha.models';
import { FichaDrawer } from './ficha-drawer.component';

const EMPLEADO_ID = 12;
const URL_FICHA = `${environment.apiBaseUrl}/empleados/${EMPLEADO_ID}`;
const URL_HISTORIAL_BAJAS = `${URL_FICHA}/historial-bajas`;
const URL_MOTIVOS = `${environment.apiBaseUrl}/catalogos/motivos-baja`;
const URL_BAJA = `${URL_FICHA}/baja`;

/**
 * Catalog of the two authorised kinds plus a third one the screen must hide:
 * `MotivoBaja` carries no `tipo`, so only the two claves with a known meaning
 * are offered.
 */
const MOTIVOS: readonly MotivoBaja[] = [
  { id: 1, clave: 'BAJA_DEFINITIVA', descripcion: 'Baja definitiva' },
  { id: 4, clave: 'BAJA_TEMPORAL', descripcion: 'Baja temporal' },
  { id: 9, clave: 'JUBILACION', descripcion: 'Jubilación' },
];

/** One closed period and the one in force, as the log answers them. */
const HISTORIAL: readonly HistorialBaja[] = [
  {
    id: 31,
    tipo: 'definitiva',
    motivo_id: 1,
    motivo: 'Baja definitiva',
    motivo_clave: 'BAJA_DEFINITIVA',
    desde: '2024-03-01',
    hasta: '2025-01-31',
    vigente: false,
    nota: 'Renuncia voluntaria',
    registrado_por: 'Operador',
    reactivado_por: 'Operador',
    nota_reactivacion: 'Reingreso autorizado',
    fecha_registro: '2024-03-01',
  },
  {
    id: 32,
    tipo: 'licencia',
    motivo_id: 4,
    motivo: 'Baja temporal',
    motivo_clave: 'BAJA_TEMPORAL',
    desde: '2026-11-11',
    hasta: null,
    vigente: true,
    nota: 'Licencia por incapacidad',
    registrado_por: 'Operador',
    reactivado_por: null,
    nota_reactivacion: null,
    fecha_registro: '2026-11-11',
  },
];

/** The record of a worker already out of the roster, with a leave in force. */
const FICHA_INACTIVA: FichaEmpleado = {
  id: EMPLEADO_ID,
  identificacion: {
    num_empleado: 'UTN-001',
    nombre: 'Nombre Apellido',
    curp: null,
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
    activo: false,
    fecha_baja: '2026-11-11',
    motivo_baja: 'Licencia por incapacidad',
    nota_baja: 'Licencia por incapacidad temporal',
    observaciones: null,
    estado_expediente: { estado: 'completo', total_faltantes: 0, campos_faltantes: [] },
  },
};

/** The record exactly as the contract describes it, one nullable field per block. */
const FICHA: FichaEmpleado = {
  id: EMPLEADO_ID,
  identificacion: {
    num_empleado: 'UTN-001',
    nombre: 'Nombre Apellido',
    curp: null,
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

interface DialogPrototypePatch {
  showModal: () => void;
  close: () => void;
}

/**
 * The HTTP mock of the spec, at module scope so the helpers below — which open
 * the annex and answer its requests — can reach it.
 */
let httpMock: HttpTestingController;

/**
 * jsdom ships `HTMLDialogElement` without `showModal` / `close`, so the spec has
 * to provide them — the same patch the drawer and the modal specs use.
 * Production code calls the platform API unchanged.
 */
function patchDialogPrototype(): void {
  const proto = HTMLDialogElement.prototype as unknown as DialogPrototypePatch;

  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };

  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

@Component({
  imports: [FichaDrawer],
  template: `<app-ficha-drawer
    [empleadoId]="empleadoId()"
    [completitud]="completitud()"
    [puedeEditar]="puedeEditar()"
    [(open)]="open"
    (editarSolicitado)="editado.push($event)"
    (bajaRegistrada)="registradas.push(1)"
  />`,
})
class FichaHost {
  readonly empleadoId = signal<number | null>(EMPLEADO_ID);
  readonly completitud = signal<ResumenCompletitud | null>(null);
  readonly puedeEditar = signal(false);
  readonly open = signal(false);
  readonly editado: number[] = [];
  readonly registradas: number[] = [];
}

function host(fixture: ComponentFixture<FichaHost>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: ComponentFixture<FichaHost>): string {
  return host(fixture).textContent ?? '';
}

/** The four tabs of the folder, in the order the strip presents them. */
function tabs(fixture: ComponentFixture<FichaHost>): HTMLButtonElement[] {
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

function tab(fixture: ComponentFixture<FichaHost>, etiqueta: string): HTMLButtonElement {
  const encontrada = tabs(fixture).find((elemento) => (elemento.textContent ?? '').includes(etiqueta));
  if (!encontrada) {
    throw new Error(`No tab labelled ${etiqueta}`);
  }
  return encontrada;
}

/** Value printed under a label of the sheet, found by the label the user reads. */
function valueOf(fixture: ComponentFixture<FichaHost>, etiqueta: string): string | undefined {
  const labels = Array.from(host(fixture).querySelectorAll('.label'));
  const label = labels.find((elemento) => elemento.textContent?.trim() === etiqueta);
  return label?.parentElement?.querySelector('.value')?.textContent?.trim();
}

function fieldOf(fixture: ComponentFixture<FichaHost>, etiqueta: string): HTMLElement | undefined {
  const labels = Array.from(host(fixture).querySelectorAll('.label'));
  const label = labels.find((elemento) => elemento.textContent?.trim() === etiqueta);
  return label?.parentElement as HTMLElement | undefined;
}

function stamp(fixture: ComponentFixture<FichaHost>): HTMLElement | null {
  return host(fixture).querySelector<HTMLElement>('.stamp');
}

/** The completeness block the page may hand to the folder, when it is there. */
function completitudDe(fixture: ComponentFixture<FichaHost>): HTMLElement | null {
  return host(fixture).querySelector<HTMLElement>(
    '[role="group"][aria-label="Completitud del expediente"]',
  );
}

/** Value printed under a label inside one block, found by the label. */
function valorEn(bloque: HTMLElement | null, etiqueta: string): string | undefined {
  const etiquetas = Array.from(bloque?.querySelectorAll('.label') ?? []);
  const encontrada = etiquetas.find((elemento) => elemento.textContent?.trim() === etiqueta);
  return encontrada?.parentElement?.querySelector('.value')?.textContent?.trim();
}

function boton(fixture: ComponentFixture<FichaHost>, etiqueta: string): HTMLButtonElement | undefined {
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find((elemento) =>
    (elemento.textContent ?? '').includes(etiqueta),
  );
}

/** Presses a key on the strip the way a keyboard does: it bubbles to the list. */
function pulsar(fixture: ComponentFixture<FichaHost>, key: string): void {
  const activa = host(fixture).querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
  activa?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

// ---------------------------------------------------------------------------
// Second level
// ---------------------------------------------------------------------------

/** The annex over the folder. */
function panelDe(fixture: ComponentFixture<FichaHost>): HTMLElement | null {
  return host(fixture).querySelector<HTMLElement>('.panel');
}

/** Button inside the annex, by the label it reads. */
function accionPanel(
  fixture: ComponentFixture<FichaHost>,
  etiqueta: string,
): HTMLButtonElement | undefined {
  const botones = panelDe(fixture)?.querySelectorAll<HTMLButtonElement>('button') ?? [];
  return Array.from(botones).find((elemento) => (elemento.textContent ?? '').includes(etiqueta));
}

/** Choices of the motive select, as the user reads them. */
function opcionesDelSelect(fixture: ComponentFixture<FichaHost>): string[] {
  const select = panelDe(fixture)?.querySelector<HTMLSelectElement>('#panel-motivo');
  return Array.from(select?.options ?? []).map((option) => option.textContent?.trim() ?? '');
}

/** Chooses an option the way a keyboard or a pointer does: value first, event after. */
function elegirMotivo(fixture: ComponentFixture<FichaHost>, motivoId: string): void {
  const select = panelDe(fixture)?.querySelector<HTMLSelectElement>('#panel-motivo');
  if (!select) {
    throw new Error('No motive select rendered');
  }
  select.value = motivoId;
  select.dispatchEvent(new Event('change'));
}

/** Types into the note: the value lands first, then the event fires. */
function escribirNota(fixture: ComponentFixture<FichaHost>, nota: string): void {
  const campo = panelDe(fixture)?.querySelector<HTMLTextAreaElement>('#panel-nota');
  if (!campo) {
    throw new Error('No note rendered');
  }
  campo.value = nota;
  campo.dispatchEvent(new Event('input'));
}

/** Moves the folder to the `Estado` sheet, which is where the level opens from. */
async function irAEstado(fixture: ComponentFixture<FichaHost>): Promise<void> {
  tab(fixture, 'Estado').click();
  await fixture.whenStable();
}

/** Opens the termination form of an active worker and answers the catalogue. */
async function abrirFormatoBaja(fixture: ComponentFixture<FichaHost>): Promise<void> {
  await irAEstado(fixture);
  boton(fixture, 'Dar de baja')?.click();
  await fixture.whenStable();
  httpMock.expectOne(URL_MOTIVOS).flush({ data: MOTIVOS });
  await fixture.whenStable();
}

describe('FichaDrawer', () => {
  beforeEach(async () => {
    patchDialogPrototype();
    await TestBed.configureTestingModule({
      imports: [FichaHost],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  /** Mounts the host and opens the panel, which is what starts the request. */
  async function abrir(): Promise<ComponentFixture<FichaHost>> {
    const fixture = TestBed.createComponent(FichaHost);
    await fixture.whenStable();

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    return fixture;
  }

  /** Answers both streams of the panel: the record and its absence log. */
  async function responder(
    fixture: ComponentFixture<FichaHost>,
    ficha: FichaEmpleado = FICHA,
    bajas: readonly HistorialBaja[] = [],
  ): Promise<void> {
    httpMock.expectOne(URL_FICHA).flush({ data: ficha });
    httpMock.expectOne(URL_HISTORIAL_BAJAS).flush({ data: bajas });
    await fixture.whenStable();
  }

  it('loads the record and states who it is about', async () => {
    const fixture = await abrir();
    await responder(fixture);

    // The desk names the worker, and so does the sheet: a document says who it
    // is about before it says anything else.
    expect(host(fixture).querySelector('.bar-name')?.textContent?.trim()).toBe('Nombre Apellido');
    expect(host(fixture).querySelector('.head-title')?.textContent?.trim()).toBe('Nombre Apellido');
    expect(host(fixture).querySelector('.head-meta')?.textContent?.trim()).toBe(
      'No. de empleado UTN-001',
    );
    // The label is read without the badge: the count has its own test.
    const etiquetas = tabs(fixture).map((elemento) => {
      const copia = elemento.cloneNode(true) as HTMLElement;
      copia.querySelectorAll('.nb').forEach((nodo) => nodo.remove());
      return copia.textContent?.trim();
    });
    expect(etiquetas).toEqual(['Ficha', 'Plaza', 'Formación', 'Estado']);
    expect(host(fixture).querySelector('.foot')?.textContent?.trim()).toBe(
      'Folio 0012 · Hoja 1 de 4',
    );
    // The backend sentence of the tenure is displayed, not recomposed.
    expect(text(fixture)).toContain('14 de mayo de 1990');
  });

  it('renders the record inside a bare drawer, without the glass chrome', async () => {
    const fixture = await abrir();
    await responder(fixture);

    const dialog = host(fixture).querySelector('dialog');
    expect(dialog?.classList.contains('is-bare')).toBe(true);
    expect(dialog?.hasAttribute('aria-labelledby')).toBe(false);
    expect(dialog?.getAttribute('aria-label')).toBe('Ficha del trabajador');
    expect(dialog?.querySelector('.header')).toBeNull();
    expect(dialog?.querySelector('.footer')).toBeNull();
  });

  const FALLAS = [
    {
      caso: '401',
      status: 401,
      cuerpo: { message: 'Unauthenticated.' },
      mensaje: 'Tu sesión venció. Vuelve a iniciar sesión.',
      reintenta: false,
    },
    {
      caso: '403',
      status: 403,
      cuerpo: { message: 'No autorizado.', codigo: 'permiso_denegado' },
      mensaje: 'No tienes permisos para ver esta ficha.',
      reintenta: false,
    },
    {
      caso: '404',
      status: 404,
      cuerpo: { message: 'Trabajador no encontrado.' },
      mensaje: 'No encontramos ese trabajador.',
      reintenta: false,
    },
    {
      caso: '500',
      status: 500,
      cuerpo: { message: 'Server Error' },
      mensaje: 'No pudimos conectar con el servidor. Revisa tu conexión.',
      reintenta: true,
    },
  ];

  for (const falla of FALLAS) {
    it(`explains a ${falla.caso} and offers only what it can offer`, async () => {
      const fixture = await abrir();

      httpMock
        .expectOne(URL_FICHA)
        .flush(falla.cuerpo, { status: falla.status, statusText: falla.caso });
      httpMock.expectOne(URL_HISTORIAL_BAJAS).flush({ data: [] });
      await fixture.whenStable();

      const alerta = host(fixture).querySelector<HTMLElement>('.state[role="alert"]');
      expect(alerta?.textContent).toContain(falla.mensaje);
      expect(boton(fixture, 'Reintentar') !== undefined).toBe(falla.reintenta);
    });
  }

  it('asks for the record again from the retry of the failure', async () => {
    const fixture = await abrir();

    httpMock.expectOne(URL_FICHA).flush({}, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(URL_HISTORIAL_BAJAS).flush({ data: [] });
    await fixture.whenStable();

    boton(fixture, 'Reintentar')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    httpMock.expectOne(URL_HISTORIAL_BAJAS).flush({ data: [] });
    await fixture.whenStable();

    expect(host(fixture).querySelector('.state')).toBeNull();
    expect(text(fixture)).toContain('Nombre Apellido');
  });

  it('switches sheet from its tab and keeps one panel for all four', async () => {
    const fixture = await abrir();
    await responder(fixture);

    const panel = host(fixture).querySelector<HTMLElement>('[role="tabpanel"]');
    expect(panel).not.toBeNull();

    tab(fixture, 'Plaza').click();
    await fixture.whenStable();

    expect(tab(fixture, 'Plaza').getAttribute('aria-selected')).toBe('true');
    expect(tab(fixture, 'Ficha').getAttribute('aria-selected')).toBe('false');
    expect(panel?.id).toBe('ficha-panel');
    expect(panel?.getAttribute('aria-labelledby')).toBe('ficha-tab-plaza');
    expect(host(fixture).querySelector('.head-meta')?.textContent?.trim()).toBe('Área A');
    expect(valueOf(fixture, 'Puesto')).toBe('Analista');
    expect(valueOf(fixture, 'Categoría CCT')).toBe('CCT-01');
    expect(valueOf(fixture, 'Jornada')).toBe('Completa');
    expect(valueOf(fixture, 'Antigüedad')).toBe('7 años, 4 meses');
    expect(host(fixture).querySelector('.foot')?.textContent?.trim()).toBe(
      'Folio 0012 · Hoja 2 de 4',
    );

    tab(fixture, 'Formación').click();
    await fixture.whenStable();
    expect(valueOf(fixture, 'Nivel de estudios')).toBe('Licenciatura');
    expect(valueOf(fixture, 'Sector público')).toBe('5');
    expect(text(fixture)).toContain('Experiencia laboral');
  });

  it('walks the strip with the arrow keys and roving focus', async () => {
    const fixture = await abrir();
    await responder(fixture);

    expect(tab(fixture, 'Ficha').getAttribute('tabindex')).toBe('0');
    expect(tab(fixture, 'Plaza').getAttribute('tabindex')).toBe('-1');

    pulsar(fixture, 'ArrowRight');
    await fixture.whenStable();

    expect(tab(fixture, 'Plaza').getAttribute('aria-selected')).toBe('true');
    expect(tab(fixture, 'Plaza').getAttribute('tabindex')).toBe('0');
    expect(tab(fixture, 'Ficha').getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(tab(fixture, 'Plaza'));

    pulsar(fixture, 'End');
    await fixture.whenStable();
    expect(tab(fixture, 'Estado').getAttribute('aria-selected')).toBe('true');

    // The strip wraps around: one step right from the last tab is the first.
    pulsar(fixture, 'ArrowRight');
    await fixture.whenStable();
    expect(tab(fixture, 'Ficha').getAttribute('aria-selected')).toBe('true');

    pulsar(fixture, 'ArrowLeft');
    await fixture.whenStable();
    expect(tab(fixture, 'Estado').getAttribute('aria-selected')).toBe('true');

    pulsar(fixture, 'Home');
    await fixture.whenStable();
    expect(tab(fixture, 'Ficha').getAttribute('aria-selected')).toBe('true');
  });

  it('seals an incomplete file and an active worker', async () => {
    const fixture = await abrir();
    await responder(fixture);

    expect(stamp(fixture)?.textContent?.trim()).toBe('FALTAN 2 DATOS');
    expect(stamp(fixture)?.classList.contains('is-bad')).toBe(true);

    tab(fixture, 'Estado').click();
    await fixture.whenStable();

    expect(stamp(fixture)?.textContent?.trim()).toBe('ACTIVO');
    expect(stamp(fixture)?.classList.contains('is-ok')).toBe(true);
  });

  it('seals a complete file and reads a leave as a leave', async () => {
    const fixture = await abrir();
    await responder(fixture, {
      ...FICHA,
      gestion_interna: {
        ...FICHA.gestion_interna,
        activo: false,
        motivo_baja: 'Licencia por incapacidad',
        fecha_baja: '2026-11-11',
        nota_baja: 'Licencia por incapacidad temporal',
        estado_expediente: { estado: 'completo', total_faltantes: 0, campos_faltantes: [] },
      },
    });

    expect(stamp(fixture)?.textContent?.trim()).toBe('EXPEDIENTE COMPLETO');
    expect(stamp(fixture)?.classList.contains('is-ok')).toBe(true);

    tab(fixture, 'Estado').click();
    await fixture.whenStable();

    expect(stamp(fixture)?.textContent?.trim()).toBe('LICENCIA');
    // The three fields of the baja explain the state, so they come first.
    expect(valueOf(fixture, 'Fecha de baja')).toBe('11 de noviembre de 2026');
    expect(valueOf(fixture, 'Motivo')).toBe('Licencia por incapacidad');
    expect(valueOf(fixture, 'Nota')).toBe('Licencia por incapacidad temporal');
    // A file with nothing missing lists nothing missing.
    expect(valueOf(fixture, 'Campos faltantes')).toBe('Ninguno');
  });

  it('prints the completeness the page hands in, on the Estado sheet only', async () => {
    const fixture = await abrir();
    // The figures the semáforo list carries in the row it opened.
    fixture.componentInstance.completitud.set({
      porcentaje: 78.95,
      total_campos: 19,
      campos_completos: 15,
      campos_faltantes: 4,
    });
    await responder(fixture);

    // The block belongs to `Estado`: the first sheet does not carry it.
    expect(text(fixture)).not.toContain('Completitud');

    await irAEstado(fixture);

    const bloque = completitudDe(fixture);
    expect(bloque).not.toBeNull();
    expect(valorEn(bloque, 'Avance del expediente')).toBe('78.95 % completo');
    expect(valorEn(bloque, 'Campos completos')).toBe('15');
    expect(valorEn(bloque, 'Campos faltantes')).toBe('4');
    expect(valorEn(bloque, 'Total obligatorio')).toBe('19');

    // The record's own rows stay: the block adds information, it does not
    // replace what `estado_expediente` says.
    expect(valueOf(fixture, 'Estado del expediente')).toBe('Casi completo · faltan 2 campos');
    expect(valueOf(fixture, 'Campos faltantes')).toBe('CURP, Entidad de nacimiento');
  });

  it('leaves the Estado sheet as it is when the page hands nothing in', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await irAEstado(fixture);

    // The roster mounts the same folder without figures: nothing is invented.
    expect(fixture.componentInstance.completitud()).toBeNull();
    expect(completitudDe(fixture)).toBeNull();
    expect(text(fixture)).not.toContain('Completitud');
    expect(valueOf(fixture, 'Estado del expediente')).toBe('Casi completo · faltan 2 campos');
  });

  it('marks a missing field and counts the ones each tab owns', async () => {
    const fixture = await abrir();
    await responder(fixture, {
      ...FICHA,
      gestion_interna: {
        ...FICHA.gestion_interna,
        estado_expediente: {
          estado: 'incompleto',
          total_faltantes: 4,
          // `desconocido` is a key this screen does not know: it must not add a
          // badge anywhere, and it must not crash the sheet either.
          campos_faltantes: ['curp', 'entidad_nacimiento', 'generacion', 'desconocido'],
        },
      },
    });

    const curp = fieldOf(fixture, 'CURP');
    expect(curp?.classList.contains('is-missing')).toBe(true);
    expect(curp?.querySelector('.value')?.textContent?.trim()).toBe('Falta capturar');

    const badge = (etiqueta: string): HTMLElement | null =>
      tab(fixture, etiqueta).querySelector<HTMLElement>('.nb');

    expect(badge('Ficha')?.textContent?.trim()).toBe('2');
    expect(badge('Ficha')?.getAttribute('aria-label')).toBe('2 campos faltantes');
    expect(badge('Formación')?.textContent?.trim()).toBe('1');
    expect(badge('Plaza')).toBeNull();
    expect(badge('Estado')).toBeNull();
  });

  it('prints a placeholder for a value nobody has filled', async () => {
    const fixture = await abrir();
    await responder(fixture);

    tab(fixture, 'Formación').click();
    await fixture.whenStable();

    const donde = fieldOf(fixture, '¿Dónde?');
    expect(donde?.classList.contains('is-missing')).toBe(false);
    expect(donde?.querySelector('.value')?.textContent?.trim()).toBe('Sin registro');
    expect(donde?.querySelector('.value')?.classList.contains('is-empty')).toBe(true);
  });

  it('hides the edit action without permission and emits it with one', async () => {
    const fixture = await abrir();
    await responder(fixture);

    expect(host(fixture).querySelector('[aria-label="Editar la ficha"]')).toBeNull();

    fixture.componentInstance.puedeEditar.set(true);
    await fixture.whenStable();

    const editar = host(fixture).querySelector<HTMLButtonElement>('[aria-label="Editar la ficha"]');
    expect(editar).not.toBeNull();
    editar?.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.editado).toEqual([EMPLEADO_ID]);
    // The panel leaves for the edition: keeping it open would show a record the
    // user is already changing somewhere else.
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('closes into the model from its own bar', async () => {
    const fixture = await abrir();
    await responder(fixture);

    boton(fixture, 'Cerrar')?.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('opens on the first sheet again after a visit', async () => {
    const fixture = await abrir();
    await responder(fixture);

    tab(fixture, 'Estado').click();
    await fixture.whenStable();
    expect(tab(fixture, 'Estado').getAttribute('aria-selected')).toBe('true');

    boton(fixture, 'Cerrar')?.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.open()).toBe(false);
    expect(tab(fixture, 'Ficha').getAttribute('aria-selected')).toBe('true');
  });

  // -------------------------------------------------------------------------
  // Second level of the record
  // -------------------------------------------------------------------------

  it('opens the absence log over the folder, which stays visible but inert', async () => {
    const fixture = await abrir();
    await responder(fixture, FICHA, HISTORIAL);
    await irAEstado(fixture);

    // While closed, the annex is out of reach and the folder is not.
    expect(panelDe(fixture)?.hasAttribute('inert')).toBe(true);
    expect(panelDe(fixture)?.getAttribute('aria-hidden')).toBe('true');
    expect(host(fixture).querySelector('.folder')?.hasAttribute('inert')).toBe(false);

    boton(fixture, 'Historial de bajas')?.click();
    await fixture.whenStable();

    const bar = host(fixture).querySelector('.bar');
    const folder = host(fixture).querySelector('.folder');

    // The folder steps back: dimmed by the state class, inert and hidden from
    // assistive tech, so nothing behind the annex is reachable.
    expect(host(fixture).querySelector('.ficha')?.classList.contains('is-l2')).toBe(true);
    expect(bar?.hasAttribute('inert')).toBe(true);
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
    expect(folder?.hasAttribute('inert')).toBe(true);
    expect(folder?.getAttribute('aria-hidden')).toBe('true');

    // The annex itself is the opposite of inert.
    expect(panelDe(fixture)?.hasAttribute('inert')).toBe(false);
    expect(panelDe(fixture)?.getAttribute('aria-hidden')).toBeNull();
    expect(panelDe(fixture)?.classList.contains('is-open')).toBe(true);
    expect(panelDe(fixture)?.textContent).toContain('Historial de bajas');
    expect(panelDe(fixture)?.textContent).toContain('Anexo al folio 0012');
  });

  it('moves the focus into the annex and back to the action that opened it', async () => {
    const fixture = await abrir();
    await responder(fixture, FICHA, HISTORIAL);
    await irAEstado(fixture);

    const origen = boton(fixture, 'Historial de bajas');
    origen?.click();
    await fixture.whenStable();

    expect(document.activeElement).toBe(panelDe(fixture));

    accionPanel(fixture, 'Volver')?.click();
    await fixture.whenStable();

    expect(panelDe(fixture)?.classList.contains('is-open')).toBe(false);
    expect(document.activeElement).toBe(origen);
    expect(host(fixture).querySelector('.folder')?.hasAttribute('inert')).toBe(false);
  });

  it('lists the absence log with type, dates as dd/mm/aaaa and the open period', async () => {
    const fixture = await abrir();
    await responder(fixture, FICHA, HISTORIAL);
    await irAEstado(fixture);

    // The action carries the count of the loaded log.
    expect(boton(fixture, 'Historial de bajas')?.textContent).toContain('(2)');

    boton(fixture, 'Historial de bajas')?.click();
    await fixture.whenStable();

    const entradas = Array.from(panelDe(fixture)?.querySelectorAll<HTMLElement>('.evento') ?? []);
    expect(entradas.length).toBe(2);

    // A closed period: stamped red, no `(vigente)`.
    expect(entradas[0].classList.contains('is-ok')).toBe(false);
    expect(entradas[0].querySelector('.tipo')?.textContent?.trim()).toBe('Baja definitiva');
    expect(entradas[0].textContent).toContain('Desde 01/03/2024');
    expect(entradas[0].textContent).toContain('· reingreso 31/01/2025');
    expect(entradas[0].textContent).toContain('Renuncia voluntaria');
    expect(entradas[0].textContent).toContain('Reactivación: Reingreso autorizado');

    // The one in force: green, and it says so in words too.
    expect(entradas[1].classList.contains('is-ok')).toBe(true);
    expect(entradas[1].querySelector('.tipo')?.textContent?.trim()).toBe('Licencia (vigente)');
    expect(entradas[1].textContent).toContain('Desde 11/11/2026');
    expect(entradas[1].textContent).not.toContain('reingreso');
  });

  it('says there are no records without inventing a row', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await irAEstado(fixture);

    expect(boton(fixture, 'Historial de bajas')?.textContent).toContain('(0)');

    boton(fixture, 'Historial de bajas')?.click();
    await fixture.whenStable();

    expect(panelDe(fixture)?.querySelectorAll('.evento').length).toBe(0);
    expect(panelDe(fixture)?.querySelector('.state-text')?.textContent?.trim()).toBe(
      'Sin registros.',
    );
  });

  it('shows the loading block of the log and then the list it received', async () => {
    const fixture = await abrir();

    // Only the record is answered: the log is still travelling, so the action
    // offers no count yet.
    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();
    await irAEstado(fixture);
    expect(boton(fixture, 'Historial de bajas')?.textContent?.trim()).toBe('Historial de bajas');

    boton(fixture, 'Historial de bajas')?.click();
    await fixture.whenStable();
    expect(panelDe(fixture)?.querySelector('.skeleton')).not.toBeNull();

    httpMock.expectOne(URL_HISTORIAL_BAJAS).flush({ data: HISTORIAL });
    await fixture.whenStable();

    expect(panelDe(fixture)?.querySelector('.skeleton')).toBeNull();
    expect(panelDe(fixture)?.querySelectorAll('.evento').length).toBe(2);
  });

  it('explains a failure of the log and asks for it again from the annex', async () => {
    const fixture = await abrir();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    httpMock.expectOne(URL_HISTORIAL_BAJAS).flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    await irAEstado(fixture);

    boton(fixture, 'Historial de bajas')?.click();
    await fixture.whenStable();

    const alerta = panelDe(fixture)?.querySelector<HTMLElement>('.state[role="alert"]');
    expect(alerta?.textContent).toContain('No pudimos conectar con el servidor.');

    accionPanel(fixture, 'Reintentar')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_HISTORIAL_BAJAS).flush({ data: HISTORIAL });
    await fixture.whenStable();

    expect(panelDe(fixture)?.querySelector('.state')).toBeNull();
    expect(panelDe(fixture)?.querySelectorAll('.evento').length).toBe(2);
  });

  it('offers the two kinds of motive the screen can explain, with backend labels', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await abrirFormatoBaja(fixture);

    // `JUBILACION` is in the catalogue but is not one of the two known kinds.
    expect(opcionesDelSelect(fixture)).toEqual([
      'Elige un motivo',
      'Baja definitiva',
      'Baja temporal',
    ]);
    expect(panelDe(fixture)?.textContent).toContain('UTN-001 — Nombre Apellido');
    expect(panelDe(fixture)?.textContent).toContain('no se puede deshacer desde esta pantalla');
    expect(panelDe(fixture)?.textContent).toContain('La fecha de baja la fija el servidor');
  });

  it('reads the catalogue once per record, not on every open', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await abrirFormatoBaja(fixture);

    accionPanel(fixture, 'Volver')?.click();
    await fixture.whenStable();

    boton(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    // Nothing was asked again: `httpMock.verify()` fails on a second read.
    expect(httpMock.match(URL_MOTIVOS).length).toBe(0);
    expect(opcionesDelSelect(fixture).length).toBe(3);
  });

  it('keeps the submit disabled until a motive is chosen and the note is not blank', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await abrirFormatoBaja(fixture);

    expect(accionPanel(fixture, 'Dar de baja')?.disabled).toBe(true);

    // A note alone is not enough.
    escribirNota(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();
    expect(accionPanel(fixture, 'Dar de baja')?.disabled).toBe(true);

    // A motive alone is not enough either, and spaces are still empty.
    elegirMotivo(fixture, '4');
    escribirNota(fixture, '   ');
    await fixture.whenStable();
    expect(accionPanel(fixture, 'Dar de baja')?.disabled).toBe(true);

    escribirNota(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();
    expect(accionPanel(fixture, 'Dar de baja')?.disabled).toBe(false);
  });

  it('asks before throwing away a typed note, and keeps it when told to', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await abrirFormatoBaja(fixture);

    escribirNota(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();

    accionPanel(fixture, 'Volver')?.click();
    await fixture.whenStable();

    const aviso = panelDe(fixture)?.querySelector<HTMLElement>('.discard[role="alert"]');
    expect(aviso?.textContent).toContain('Hay datos sin guardar.');
    expect(panelDe(fixture)?.classList.contains('is-open')).toBe(true);

    // Keeping the draft removes the question and leaves the note where it was.
    accionPanel(fixture, 'Seguir editando')?.click();
    await fixture.whenStable();
    expect(panelDe(fixture)?.querySelector('.discard')).toBeNull();
    expect(
      panelDe(fixture)?.querySelector<HTMLTextAreaElement>('#panel-nota')?.value,
    ).toBe('Licencia por incapacidad');

    // Giving it up leaves.
    accionPanel(fixture, 'Volver')?.click();
    await fixture.whenStable();
    accionPanel(fixture, 'Descartar')?.click();
    await fixture.whenStable();
    expect(panelDe(fixture)?.classList.contains('is-open')).toBe(false);
  });

  it('does not ask about discarded data when the note is empty', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await abrirFormatoBaja(fixture);

    accionPanel(fixture, 'Volver')?.click();
    await fixture.whenStable();

    expect(panelDe(fixture)?.querySelector('.discard')).toBeNull();
    expect(panelDe(fixture)?.classList.contains('is-open')).toBe(false);
  });

  it('places the message of a 422 next to the note', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await abrirFormatoBaja(fixture);

    elegirMotivo(fixture, '4');
    escribirNota(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();

    accionPanel(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_BAJA).flush(
      {
        message: 'Los datos no son válidos.',
        errors: { nota: ['La nota no puede tener más de 1000 caracteres.'] },
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();

    const error = panelDe(fixture)?.querySelector<HTMLElement>('#error-nota');
    expect(error?.textContent?.trim()).toBe('La nota no puede tener más de 1000 caracteres.');
    expect(error?.getAttribute('role')).toBe('alert');

    const nota = panelDe(fixture)?.querySelector<HTMLTextAreaElement>('#panel-nota');
    expect(nota?.classList.contains('is-invalid')).toBe(true);
    expect(nota?.getAttribute('aria-describedby')).toBe('panel-nota-contador error-nota');
    expect(panelDe(fixture)?.classList.contains('is-open')).toBe(true);
  });

  it('shows the backend sentence of a 409 and keeps the annex open', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await abrirFormatoBaja(fixture);

    elegirMotivo(fixture, '4');
    escribirNota(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();

    accionPanel(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_BAJA).flush(
      { mensaje: 'El trabajador ya está dado de baja.', codigo: 'trabajador_ya_inactivo' },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(panelDe(fixture)?.textContent).toContain('El trabajador ya está dado de baja.');
    expect(panelDe(fixture)?.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.componentInstance.registradas).toEqual([]);
    expect(panelDe(fixture)?.classList.contains('is-open')).toBe(true);

    // Retrying cannot change the answer: only the way out is left.
    expect(accionPanel(fixture, 'Dar de baja')).toBeUndefined();
    expect(accionPanel(fixture, 'Cerrar')).toBeDefined();
    expect(accionPanel(fixture, 'Cancelar')).toBeUndefined();
  });

  it('tells a revoked access apart from a missing permission', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await abrirFormatoBaja(fixture);

    elegirMotivo(fixture, '4');
    escribirNota(fixture, 'Licencia');
    await fixture.whenStable();

    accionPanel(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_BAJA).flush(
      { codigo: 'permiso_denegado' },
      { status: 403, statusText: 'Forbidden' },
    );
    await fixture.whenStable();
    expect(panelDe(fixture)?.textContent).toContain('No tienes permisos para dar de baja.');

    accionPanel(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    // A revoked access destroys the token and answers with no code at all.
    httpMock.expectOne(URL_BAJA).flush(
      { message: 'Unauthenticated.' },
      { status: 403, statusText: 'Forbidden' },
    );
    await fixture.whenStable();

    expect(panelDe(fixture)?.textContent).toContain(
      'Tu acceso ya no está vigente. Vuelve a iniciar sesión.',
    );
    expect(fixture.componentInstance.registradas).toEqual([]);
  });

  it('treats the route 404 as a worker that no longer exists', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await abrirFormatoBaja(fixture);

    elegirMotivo(fixture, '4');
    escribirNota(fixture, 'Licencia');
    await fixture.whenStable();

    accionPanel(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_BAJA).flush(
      { message: 'No query results for model [App\\Models\\Empleado] 99' },
      { status: 404, statusText: 'Not Found' },
    );
    await fixture.whenStable();

    // Laravel's sentence names a model, not a situation: it is replaced.
    expect(panelDe(fixture)?.textContent).toContain('Ese trabajador ya no existe');
    expect(panelDe(fixture)?.textContent).not.toContain('No query results');
  });

  it('blames the connection when the request never reached the server', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await abrirFormatoBaja(fixture);

    elegirMotivo(fixture, '4');
    escribirNota(fixture, 'Licencia');
    await fixture.whenStable();

    accionPanel(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_BAJA).error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();

    expect(panelDe(fixture)?.textContent).toContain(
      'No pudimos conectar con el servidor. Revisa tu conexión.',
    );
    expect(panelDe(fixture)?.classList.contains('is-open')).toBe(true);
  });

  it('sends the trimmed note with the chosen motive and reads the record again', async () => {
    const fixture = await abrir();
    await responder(fixture);
    await abrirFormatoBaja(fixture);

    elegirMotivo(fixture, '4');
    escribirNota(fixture, '  Licencia por incapacidad  ');
    await fixture.whenStable();

    // The counter reads what is on screen, not what will be sent.
    expect(panelDe(fixture)?.textContent).toContain('28 / 1000');

    accionPanel(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    const peticion = httpMock.expectOne(URL_BAJA);
    expect(peticion.request.method).toBe('POST');
    // Only the two fields of the contract: sending the date is a `422`.
    expect(peticion.request.body).toEqual({ motivo_id: 4, nota: 'Licencia por incapacidad' });
    expect(Object.keys(peticion.request.body as object)).toEqual(['motivo_id', 'nota']);

    peticion.flush({ mensaje: 'Baja procesada exitosamente.', empleado: {} });
    await fixture.whenStable();

    // The annex closes and the record is read again, because the state and the
    // seal changed with the act.
    expect(panelDe(fixture)?.classList.contains('is-open')).toBe(false);
    expect(fixture.componentInstance.registradas).toEqual([1]);

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA_INACTIVA });
    httpMock.expectOne(URL_HISTORIAL_BAJAS).flush({ data: [HISTORIAL[1]] });
    await fixture.whenStable();

    // The seal is pressed again, and the roster-facing action replaced the one
    // that opened the annex.
    expect(stamp(fixture)?.classList.contains('is-slam')).toBe(true);
    expect(stamp(fixture)?.textContent?.trim()).toBe('LICENCIA');
    expect(boton(fixture, 'Dar de baja')).toBeUndefined();
    expect(boton(fixture, 'Reactivar')).toBeDefined();
  });

  it('opens the reactivation form of an inactive worker, with the confirm disabled', async () => {
    const fixture = await abrir();
    await responder(fixture, FICHA_INACTIVA, [HISTORIAL[1]]);
    await irAEstado(fixture);

    boton(fixture, 'Reactivar')?.click();
    await fixture.whenStable();

    expect(panelDe(fixture)?.classList.contains('is-open')).toBe(true);
    // A leave returns the worker to the roster: that is what is being asked.
    expect(panelDe(fixture)?.textContent).toContain('padrón de activos');
    expect(panelDe(fixture)?.textContent).toContain('Licencia por incapacidad');
    expect(panelDe(fixture)?.textContent).toContain('desde 11/11/2026');

    const confirmar = accionPanel(fixture, 'Reactivar');
    expect(confirmar?.disabled).toBe(true);
    expect(panelDe(fixture)?.textContent).toContain('el endpoint aún no existe');

    // Nothing is faked: no request left the screen.
    expect(httpMock.match(URL_BAJA).length).toBe(0);
  });

  it('warns that a definitive termination cannot be reopened from here', async () => {
    const fixture = await abrir();
    // A termination that closed the post, with a label that is not a leave and
    // a log that has nothing open: the only fact left is the motive.
    await responder(
      fixture,
      {
        ...FICHA_INACTIVA,
        gestion_interna: { ...FICHA_INACTIVA.gestion_interna, motivo_baja: 'Baja definitiva' },
      },
      [HISTORIAL[0]],
    );
    await irAEstado(fixture);

    boton(fixture, 'Reactivar')?.click();
    await fixture.whenStable();

    // The absence log says `definitiva`, not `licencia`, so the sentence changes.
    expect(panelDe(fixture)?.textContent).toContain('relación laboral');
    expect(panelDe(fixture)?.textContent).toContain('tiene que autorizarlo la institución');
  });

  it('shows the pending state of the assignment history instead of rows', async () => {
    const fixture = await abrir();
    await responder(fixture);

    tab(fixture, 'Plaza').click();
    await fixture.whenStable();

    boton(fixture, 'Historial de adscripciones')?.click();
    await fixture.whenStable();

    expect(panelDe(fixture)?.classList.contains('is-open')).toBe(true);
    expect(panelDe(fixture)?.textContent).toContain('Historial de adscripciones');
    expect(panelDe(fixture)?.textContent).toContain('el endpoint aún no existe');
    expect(panelDe(fixture)?.querySelector('.evento')).toBeNull();
  });
});

