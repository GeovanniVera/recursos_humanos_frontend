import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { FormularioCatalogos } from '../../core/empleados/alta.models';
import { FichaEmpleado } from '../../core/empleados/ficha.models';
import { EmpleadoListadoItem, EmpleadoListadoResponse, ContadoresEstatus } from '../../core/empleados/listado.models';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { AltaDrawer } from './alta-drawer/alta-drawer.component';
import { EmpleadosPage } from './empleados-page.component';
import { FichaDrawer } from './ficha-drawer/ficha-drawer.component';

const URL_EMPLEADOS = `${environment.apiBaseUrl}/empleados`;
const URL_FICHA = `${environment.apiBaseUrl}/empleados`;
const URL_FORMULARIO = `${environment.apiBaseUrl}/empleados/formulario`;

/**
 * Catalogues the registration folder reads when it opens.
 *
 * The wiring is what this screen tests, so the payload is the smallest one that
 * lets the identity sheet render with a real control on it.
 */
const CATALOGOS: FormularioCatalogos = {
  areas: [],
  puestos: [],
  categorias_cct: [],
  niveles_estudios: [],
  estados_civiles: [],
  tipos_personal: ['Sindicalizado'],
  trabaja_otro_lugar: ['No', 'Publico', 'Privado'],
  sexos: ['Masculino', 'Femenino'],
  tipos_jornada: ['Matutina'],
};

/**
 * jsdom ships `HTMLDialogElement` without `showModal` / `close`. Opening the
 * record panel from this screen reaches the dialog API, so the spec provides
 * them, exactly as the drawer and modal specs do.
 */
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

/** Record the drawer is asked for. Only the fields the assertions read are real. */
function fichaDe(id: number, nombre: string): FichaEmpleado {
  return {
    id,
    identificacion: {
      num_empleado: String(id),
      nombre,
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
    actualizado_en: '2026-01-01T00:00:00+00:00',
    edicion: {
      campos_editables: ['estado_civil_id', 'exp_publico_anios', 'exp_privado_anios', 'observaciones'],
    },
    grados_academicos: [
      {
        id: 1,
        nivel_estudios_id: 3,
        nivel_estudios: 'Licenciatura',
        titulo_o_carrera: 'Licenciatura en Sistemas',
        escuela_procedencia: 'UNAM',
        generacion: '2012-2016',
        cedula_profesional: null,
        es_maximo: true,
      },
    ],
    empleos_externos: [],
    experiencia: {
      exp_publico_anios: 5,
      exp_privado_anios: 3,
    },
    gestion_interna: {
      estatus: 'activo',
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
}

const ANA: EmpleadoListadoItem = {
  id: 1,
  num_empleado: '12345',
  nombre: 'Ana Martínez',
  area: { id: 3, nombre: 'Área A' },
  estatus: 'activo',
  fecha_baja: null,
};

const LUIS: EmpleadoListadoItem = {
  id: 2,
  num_empleado: '12346',
  nombre: 'Luis Ramírez',
  area: null,
  estatus: 'baja_definitiva',
  fecha_baja: '2026-11-11',
};

const EVA: EmpleadoListadoItem = {
  id: 3,
  num_empleado: '12347',
  nombre: 'Eva Torres',
  area: { id: 3, nombre: 'Área A' },
  estatus: 'licencia',
  fecha_baja: '2026-10-01',
};

function rango(desde: number, hasta: number): number[] {
  return Array.from({ length: hasta - desde + 1 }, (_, index) => desde + index);
}

function empleado(id: number): EmpleadoListadoItem {
  return {
    id,
    num_empleado: String(10000 + id),
    nombre: `Empleado ${id}`,
    area: null,
    estatus: 'activo',
    fecha_baja: null,
  };
}

/** One answer of the endpoint. `total` is the size of the whole filtered set. */
function respuesta(
  datos: EmpleadoListadoItem[],
  total = datos.length,
  pagina = 1,
  contadores?: Partial<ContadoresEstatus>,
): EmpleadoListadoResponse {
  const porEstatus = { activo: 0, licencia: 0, baja_definitiva: 0 };
  for (const fila of datos) {
    porEstatus[fila.estatus] += 1;
  }

  return {
    datos,
    contadores: { total, ...porEstatus, ...contadores },
    meta: {
      pagina,
      por_pagina: 100,
      total,
      total_paginas: Math.max(1, Math.ceil(total / 100)),
    },
    enlaces: { anterior: null, siguiente: null },
  };
}

/** A full block of 100 records, as the two-level pager asks for it. */
function bloqueDe(pagina: number, total: number, desde: number, hasta: number): EmpleadoListadoResponse {
  return respuesta(rango(desde, hasta).map(empleado), total, pagina);
}

const PRIMER_BLOQUE = bloqueDe(1, 250, 1, 100);
const SEGUNDO_BLOQUE = bloqueDe(2, 250, 101, 200);
const TERCER_BLOQUE = bloqueDe(3, 250, 201, 250);

function host(fixture: ComponentFixture<EmpleadosPage>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function texto(fixture: ComponentFixture<EmpleadosPage>): string {
  return host(fixture).textContent ?? '';
}

/** Native `<button>` of an `app-button`, found by the label it projects. */
function buscarBoton(
  fixture: ComponentFixture<EmpleadosPage>,
  etiqueta: string,
): HTMLButtonElement | undefined {
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find((elemento) =>
    (elemento.textContent ?? '').includes(etiqueta),
  );
}

function boton(fixture: ComponentFixture<EmpleadosPage>, etiqueta: string): HTMLButtonElement {
  const encontrado = buscarBoton(fixture, etiqueta);
  if (!encontrado) {
    throw new Error(`No button labelled ${etiqueta}`);
  }
  return encontrado;
}

function campoBusqueda(fixture: ComponentFixture<EmpleadosPage>): HTMLInputElement {
  const campo = host(fixture).querySelector<HTMLInputElement>('input[type="search"]');
  if (campo === null) {
    throw new Error('No search field rendered');
  }
  return campo;
}

/** Types the way a keyboard does: the value lands first, then the event fires. */
function escribir(fixture: ComponentFixture<EmpleadosPage>, termino: string): void {
  const campo = campoBusqueda(fixture);
  campo.value = termino;
  campo.dispatchEvent(new Event('input'));
}

/**
 * Body rows, each as the visible text of its cells.
 *
 * Two decorations are dropped here: the sentence of the leading flag, which lives
 * in a `.visually-hidden` span inside the first cell, and the ink seal of the
 * state. Both are asserted by their own tests; this helper is about the data the
 * row carries, so a cell reads `12345` and not `Activo12345`.
 */
function filas(fixture: ComponentFixture<EmpleadosPage>): string[][] {
  return Array.from(host(fixture).querySelectorAll('tbody tr')).map((fila) =>
    Array.from(fila.querySelectorAll('td')).map((celda) => {
      const visible = celda.cloneNode(true) as HTMLElement;
      visible.querySelectorAll('.visually-hidden').forEach((nodo) => nodo.remove());
      return visible.textContent?.trim() ?? '';
    }),
  );
}

function encabezados(fixture: ComponentFixture<EmpleadosPage>): string[] {
  return Array.from(host(fixture).querySelectorAll('th[scope="col"]')).map(
    (celda) => celda.textContent?.trim() ?? '',
  );
}

/** The buttons of the state strip, in the order the strip shows them. */
function tabsEstado(fixture: ComponentFixture<EmpleadosPage>): HTMLButtonElement[] {
  // Scoped to the page: the three drawers are mounted closed on this screen and
  // each one carries a tab strip of its own.
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('.page .tabs .tab'));
}

/** Submits the "Ir a página" form the way the keyboard does. */
function irAPagina(fixture: ComponentFixture<EmpleadosPage>, valor: string): void {
  const form = host(fixture).querySelector<HTMLFormElement>('.pager-jump');
  const campo = host(fixture).querySelector<HTMLInputElement>('.jump-field');
  if (form === null || campo === null) {
    throw new Error('No jump control rendered');
  }
  campo.value = valor;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('EmpleadosPage', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    sessionStorage.clear();
    patchDialogPrototype();
    await TestBed.configureTestingModule({
      imports: [EmpleadosPage],
      providers: [
        // A real route, so `RouterLink` and `?pagina=` behave the way they do
        // in the shell. The screen is also created directly, which is what lets
        // the test answer one request at a time.
        provideRouter([{ path: '', component: EmpleadosPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    // The throttle countdown runs on a real interval: restore the clock before
    // tearing the fixture down so the cleanup reaches the real `clearInterval`.
    vi.useRealTimers();
    // Reset first: destroying the module cancels the requests still in flight,
    // so one failing expectation cannot leave an open request that breaks the
    // next test's module configuration.
    TestBed.resetTestingModule();
    httpMock.verify();
  });

  /** Creates the screen; the constructor already asked for the first block. */
  async function render(): Promise<ComponentFixture<EmpleadosPage>> {
    const fixture = TestBed.createComponent(EmpleadosPage);
    await fixture.whenStable();
    return fixture;
  }

  /** Every request the screen sent to the endpoint and has not been answered yet. */
  function peticiones(): TestRequest[] {
    return httpMock.match((request) => request.url === URL_EMPLEADOS);
  }

  /** Answers the single request in flight with one block. */
  async function responder(
    fixture: ComponentFixture<EmpleadosPage>,
    cuerpo: EmpleadoListadoResponse,
  ): Promise<TestRequest> {
    const abiertas = peticiones();
    expect(abiertas.length).toBe(1);
    abiertas[0].flush(cuerpo);
    await fixture.whenStable();
    return abiertas[0];
  }

  function rangoMostrado(fixture: ComponentFixture<EmpleadosPage>): string {
    return host(fixture).querySelector('.pager-range')?.textContent?.trim() ?? '';
  }

  it('renders one row per employee with the columns of the listing', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA, LUIS]));

    expect(encabezados(fixture)).toEqual(['Núm. empleado', 'Nombre', 'Área', 'Estado']);

    const cuerpo = filas(fixture);
    expect(cuerpo.length).toBe(2);
    expect(cuerpo[0]).toEqual(['12345', 'Ana Martínez', 'Área A', 'Activo']);
    expect(cuerpo[1]).toEqual(['12346', 'Luis Ramírez', '—', 'Baja definitiva']);
  });

  it('opens the registration folder from the header instead of leaving the roster', async () => {
    const fixture = await render();
    peticiones()[0].flush(respuesta([ANA]));
    await fixture.whenStable();

    // A real button: the alta is no longer a destination, it is a layer over
    // this same list.
    const alta = host(fixture).querySelector<HTMLButtonElement>('button.new-employee');
    expect(alta?.tagName.toLowerCase()).toBe('button');
    expect(alta?.textContent?.trim()).toBe('Nuevo empleado');

    alta?.click();
    await fixture.whenStable();

    // The folder asks for its catalogues the first time it opens.
    httpMock.expectOne(`${URL_FORMULARIO}`).flush(CATALOGOS);
    await fixture.whenStable();

    // The second panel of the screen: the record's is mounted first, the edit
    // folder's comes after the registration one.
    const paneles = host(fixture).querySelectorAll('dialog');
    expect(paneles.length).toBe(3);
    expect(paneles[1].hasAttribute('open')).toBe(true);
    expect(paneles[1].querySelector('.bar-name')?.textContent?.trim()).toBe('Nuevo empleado');
    expect(paneles[1].querySelector('#num_empleado')).not.toBeNull();
  });

  it('prints the number alone and the state in a column of its own', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA, LUIS]));

    const cuerpo = host(fixture).querySelectorAll('tbody tr');

    // The area with no record reads as the placeholder, not as an empty cell.
    expect(cuerpo[1].querySelectorAll('td')[2].textContent?.trim()).toBe('—');

    const primera = cuerpo[0].querySelectorAll('td');

    // The number is the only thing painted in its cell: the stamp moved out, and
    // the lane adds no text of its own (only the hidden sentence read above).
    const numero = primera[0].cloneNode(true) as HTMLElement;
    numero.querySelectorAll('.visually-hidden').forEach((nodo) => nodo.remove());
    expect(numero.textContent?.trim()).toBe('12345');
    expect(primera[0].querySelector('.seal')).toBeNull();

    // The state owns the fourth cell, with its word and its role class.
    const activo = primera[3].querySelector('.seal');
    expect(activo?.textContent?.trim()).toBe('Activo');
    expect(activo?.classList.contains('is-activo')).toBe(true);

    const baja = cuerpo[1].querySelectorAll('td')[3].querySelector('.seal');
    expect(baja?.textContent?.trim()).toBe('Baja definitiva');
    expect(baja?.classList.contains('is-baja')).toBe(true);
  });

  it('paints the lane and the stamp in the role of that state, and announces it once', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA, LUIS]));

    const cuerpo = host(fixture).querySelectorAll('tbody tr');

    // The lane lives on the leading edge of the first cell, like the traffic light.
    const laneActiva = cuerpo[0].querySelector('app-row-flag .row-flag');
    expect(laneActiva?.classList.contains('is-activo')).toBe(true);
    expect(cuerpo[0].querySelector('app-row-flag .visually-hidden')?.textContent?.trim()).toBe(
      'Estado: activo',
    );

    const laneBaja = cuerpo[1].querySelector('app-row-flag .row-flag');
    expect(laneBaja?.classList.contains('is-baja')).toBe(true);
    expect(cuerpo[1].querySelector('app-row-flag .visually-hidden')?.textContent?.trim()).toBe(
      'Estado: baja definitiva, desde 2026-11-11',
    );

    const sellos = Array.from(host(fixture).querySelectorAll('tbody .seal'));
    expect(sellos.map((sello) => sello.textContent?.trim())).toEqual(['Activo', 'Baja definitiva']);
    // The ring carries the state; the word keeps the primary ink, which is how
    // the semáforo solved the same contrast problem on the light theme.
    expect(
      sellos.map((sello) => Array.from(sello.classList).find((clase) => clase.startsWith('is-'))),
    ).toEqual(['is-activo', 'is-baja']);
    // The lane already announces the state in a sentence, so the visible stamp
    // stays out of the accessibility tree instead of being read twice.
    expect(sellos.map((sello) => sello.getAttribute('aria-hidden'))).toEqual(['true', 'true']);
  });

  it('paints a lane per status: green, amber and red', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA, EVA, LUIS]));

    const lanes = Array.from(host(fixture).querySelectorAll('tbody app-row-flag .row-flag'));

    // The same three roles the traffic light uses, one per employment status.
    expect(lanes.map((lane) => Array.from(lane.classList).find((c) => c.startsWith('is-')))).toEqual([
      'is-activo',
      'is-licencia',
      'is-baja',
    ]);
    // The lane is decoration; the sentence carries the datum.
    expect(
      Array.from(host(fixture).querySelectorAll('tbody app-row-flag .visually-hidden')).map(
        (nodo) => nodo.textContent?.trim(),
      ),
    ).toEqual([
      'Estado: activo',
      'Estado: licencia',
      'Estado: baja definitiva, desde 2026-11-11',
    ]);
  });

  it('adds the termination date only when the list can hold a terminated worker', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA]));

    // On `activo` the column would be a column of dashes.
    expect(encabezados(fixture)).toEqual(['Núm. empleado', 'Nombre', 'Área', 'Estado']);

    tabsEstado(fixture)[2].click();
    await fixture.whenStable();

    const peticion = peticiones();
    expect(peticion.length).toBe(1);
    peticion[0].flush(respuesta([LUIS]));
    await fixture.whenStable();

    expect(encabezados(fixture)).toEqual([
      'Núm. empleado',
      'Nombre',
      'Área',
      'Estado',
      'Fecha de baja',
    ]);
    // `YYYY-MM-DD` from the API reads as a calendar day, never as a timestamp.
    expect(filas(fixture)[0]).toEqual([
      '12346',
      'Luis Ramírez',
      '—',
      'Baja definitiva',
      '11/11/2026',
    ]);
  });

  it('renders the roster as the ledger sheet through the opt-in variant', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    expect(host(fixture).querySelector('.wrap')?.classList.contains('is-ledger')).toBe(true);
    expect(host(fixture).querySelector('table')?.classList.contains('is-ledger')).toBe(true);
  });

  it('renders the four state tabs in order', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    const tabs = tabsEstado(fixture);

    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.querySelector('.tab-title')?.textContent?.trim())).toEqual([
      'Todos',
      'Activos',
      'Bajas definitivas',
      'Licencias',
    ]);
    // The strip is a group of pressed buttons, not a tablist: the tabs that work
    // filter one listing instead of swapping panels.
    expect(host(fixture).querySelector('.page .tabs')?.getAttribute('role')).toBe('group');
  });

  it('keeps Activos as the selected tab and leaves the other three operable', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    const tabs = tabsEstado(fixture);

    // The screen lives at `/empleados`, so the route names the default.
    expect(tabs.map((tab) => tab.getAttribute('aria-pressed'))).toEqual([
      null,
      'true',
      null,
      null,
    ]);
    expect(tabs.map((tab) => tab.classList.contains('is-active'))).toEqual([
      false,
      true,
      false,
      false,
    ]);
    // All four answer: the endpoint filters on `estatus` in SQL.
    expect(tabs.map((tab) => tab.getAttribute('aria-disabled'))).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(tabs.map((tab) => tab.disabled)).toEqual([false, false, false, false]);

    // Each tab carries the role of the status it filters, like the traffic
    // light: `Todos` has none of its own, so it keeps the primary ink.
    expect(
      tabs.map((tab) =>
        Array.from(tab.classList).find((clase) => clase.startsWith('is-') && clase !== 'is-active'),
      ),
    ).toEqual(['is-todos', 'is-activo', 'is-baja_definitiva', 'is-licencia']);
  });

  it('asks the server for the pressed status and returns to the first page', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    const tabs = tabsEstado(fixture);

    tabs[3].click();
    await fixture.whenStable();

    const licencias = peticiones();
    expect(licencias.length).toBe(1);
    // The filter is part of the request, and a new result set starts at page 1.
    expect(licencias[0].request.params.get('estatus')).toBe('licencia');
    expect(licencias[0].request.params.get('pagina')).toBe('1');

    licencias[0].flush(respuesta([]));
    await fixture.whenStable();

    expect(tabs.map((tab) => tab.getAttribute('aria-pressed'))).toEqual([
      null,
      null,
      null,
      'true',
    ]);
    expect(texto(fixture)).toContain('Empleados en licencia');
    expect(host(fixture).querySelector('td.empty')?.textContent?.trim()).toBe(
      'No hay empleados en licencia.',
    );

    // The tab is part of the address: a deep link reopens it, and the breadcrumb
    // — which reads the URL, not this component — can name it.
    expect(router.url).toContain('estatus=licencia');

    // Pressing the status already applied is not a request.
    tabs[3].click();
    await fixture.whenStable();
    expect(peticiones().length).toBe(0);
  });

  it('prints the figures of the filtered universe, one per tab', async () => {
    const fixture = await render();
    await responder(
      fixture,
      respuesta([ANA, EVA, LUIS], 3, 1, { total: 12, activo: 9, licencia: 2, baja_definitiva: 1 }),
    );

    const tabs = tabsEstado(fixture);

    expect(tabs.map((tab) => tab.querySelector('.tab-count')?.textContent?.trim())).toEqual([
      '12',
      '9',
      '1',
      '2',
    ]);

    // The figure is hidden from assistive tech; the button reads it in a sentence.
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Todos: 12 empleados',
      'Activos: 9 empleados',
      'Bajas definitivas: 1 empleado',
      'Licencias: 2 empleados',
    ]);
  });

  it('keeps the figures stable when the tab changes, because they count the universe', async () => {
    const fixture = await render();
    await responder(
      fixture,
      respuesta([ANA], 12, 1, { total: 12, activo: 9, licencia: 2, baja_definitiva: 1 }),
    );

    const antes = tabsEstado(fixture).map(
      (tab) => tab.querySelector('.tab-count')?.textContent?.trim(),
    );

    tabsEstado(fixture)[3].click();
    await fixture.whenStable();

    const peticion = peticiones();
    expect(peticion.length).toBe(1);
    peticion[0].flush(
      respuesta([EVA], 12, 1, { total: 12, activo: 9, licencia: 2, baja_definitiva: 1 }),
    );
    await fixture.whenStable();

    // Same universe, different page of it: the four figures do not move.
    expect(
      tabsEstado(fixture).map((tab) => tab.querySelector('.tab-count')?.textContent?.trim()),
    ).toEqual(antes);
  });

  it('asks for the first page again when a different tab starts a new result set', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    const tabs = tabsEstado(fixture);

    // Every tab lands on the server: the filter narrows the query and its count,
    // so the range line and the pager never describe a slice of one block.
    tabs[0].click();
    await fixture.whenStable();

    const todos = peticiones();
    expect(todos.length).toBe(1);
    expect(todos[0].request.params.get('estatus')).toBe('todos');
    todos[0].flush(respuesta([ANA, LUIS]));
    await fixture.whenStable();

    expect(tabs.map((tab) => tab.getAttribute('aria-pressed'))).toEqual([
      'true',
      null,
      null,
      null,
    ]);
  });

  it('keeps the density control in the foot of the sheet and changes the density', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    const control = (): HTMLButtonElement[] =>
      Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('.sheet-foot .density button'));
    const tabla = (): HTMLTableElement => host(fixture).querySelector<HTMLTableElement>('table')!;

    expect(control().map((opcion) => opcion.textContent?.trim())).toEqual([
      'Compacta',
      'Estándar',
      'Amplia',
    ]);
    expect(control().map((opcion) => opcion.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    // `standard` is the padding the table always had, so it is not a class.
    expect(tabla().classList.contains('is-compact')).toBe(false);
    expect(tabla().classList.contains('is-comfortable')).toBe(false);

    control()[0].click();
    await fixture.whenStable();
    expect(tabla().classList.contains('is-compact')).toBe(true);
    expect(control()[0].getAttribute('aria-pressed')).toBe('true');

    control()[2].click();
    await fixture.whenStable();
    expect(tabla().classList.contains('is-comfortable')).toBe(true);
    expect(tabla().classList.contains('is-compact')).toBe(false);

    // Presentation of the page already in the buffer: nothing is re-asked for.
    expect(peticiones().length).toBe(0);
    expect(filas(fixture).length).toBe(20);
  });

  it('closes the sheet with the pager instead of hanging it after the table', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    const hoja = host(fixture).querySelector('.sheet');

    expect(hoja?.querySelector('app-data-table')).not.toBeNull();
    expect(hoja?.querySelector('.sheet-foot app-pagination footer.pager')).not.toBeNull();
    // The whole buffered pager travels with it: the size selector, the jump
    // field and the range line are the same controls, only re-parented.
    expect(hoja?.querySelector('.sheet-foot .page-size-select')).not.toBeNull();
    expect(hoja?.querySelector('.sheet-foot .jump-field')).not.toBeNull();
    expect(hoja?.querySelector('.sheet-foot .pager-range')?.textContent?.trim()).toBe(
      'Mostrando 1–20 de 250',
    );
    // Nothing of the listing hangs outside the paper it belongs to.
    expect(host(fixture).querySelectorAll('.page > app-pagination')).toHaveLength(0);
  });

  it('asks for 100 records and serves five logical pages out of that block', async () => {
    const fixture = await render();

    const inicial = peticiones();
    expect(inicial.length).toBe(1);
    expect(inicial[0].request.params.get('pagina')).toBe('1');
    // The network page is the block; the screen's page is 20 rows.
    expect(inicial[0].request.params.get('por_pagina')).toBe('100');

    inicial[0].flush(PRIMER_BLOQUE);
    await fixture.whenStable();

    expect(filas(fixture).length).toBe(20);
    expect(filas(fixture)[0][0]).toBe('10001');
    expect(rangoMostrado(fixture)).toBe('Mostrando 1–20 de 250');
    expect(texto(fixture)).toContain('Página 1 de 13');

    // Pages 2 to 5 are slices: no request leaves the browser.
    for (let pagina = 2; pagina <= 5; pagina += 1) {
      boton(fixture, 'Siguiente').click();
      await fixture.whenStable();
      expect(peticiones().length).toBe(0);
    }

    expect(filas(fixture)[0][0]).toBe('10081');
    expect(rangoMostrado(fixture)).toBe('Mostrando 81–100 de 250');
    expect(texto(fixture)).toContain('Página 5 de 13');

    // Page 6 crosses the block edge: one request for records 101–200.
    boton(fixture, 'Siguiente').click();
    await fixture.whenStable();

    const siguiente = peticiones();
    expect(siguiente.length).toBe(1);
    expect(siguiente[0].request.params.get('pagina')).toBe('2');
    expect(siguiente[0].request.params.get('por_pagina')).toBe('100');

    // While it travels, page 5 keeps its rows and the screen says it is loading.
    expect(filas(fixture)[0][0]).toBe('10081');
    expect(host(fixture).querySelector('.block-loading')?.textContent).toContain(
      'Cargando la página 6',
    );
    expect(host(fixture).querySelector('tbody tr.skeleton-row')).toBeNull();

    siguiente[0].flush(SEGUNDO_BLOQUE);
    await fixture.whenStable();

    expect(filas(fixture)[0][0]).toBe('10101');
    expect(rangoMostrado(fixture)).toBe('Mostrando 101–120 de 250');
    expect(texto(fixture)).toContain('Página 6 de 13');
    expect(host(fixture).querySelector('.block-loading')).toBeNull();
  });

  it('shows the partial last page from the last block', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    boton(fixture, 'Última').click();
    await fixture.whenStable();

    const ultimo = peticiones();
    expect(ultimo.length).toBe(1);
    expect(ultimo[0].request.params.get('pagina')).toBe('3');
    ultimo[0].flush(TERCER_BLOQUE);
    await fixture.whenStable();

    expect(filas(fixture).length).toBe(10);
    expect(filas(fixture)[0][0]).toBe('10241');
    expect(rangoMostrado(fixture)).toBe('Mostrando 241–250 de 250');
    expect(texto(fixture)).toContain('Página 13 de 13');
    expect(boton(fixture, 'Siguiente').disabled).toBe(true);
    expect(boton(fixture, 'Última').disabled).toBe(true);
    expect(boton(fixture, 'Primera').disabled).toBe(false);
    expect(boton(fixture, 'Anterior').disabled).toBe(false);

    boton(fixture, 'Primera').click();
    await fixture.whenStable();

    // Block 1 is still cached: coming back costs no request.
    expect(peticiones().length).toBe(0);
    expect(filas(fixture)[0][0]).toBe('10001');
  });

  it('draws the first/last chevrons as decoration, outside the accessible name', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    for (const [etiqueta, glifo] of [
      ['Primera', '«'],
      ['Última', '»'],
    ] as const) {
      // `aria-hidden` keeps the glyph out of the name the screen reader says.
      const flecha = boton(fixture, etiqueta).querySelector('span[aria-hidden="true"]');
      expect(flecha?.textContent?.trim()).toBe(glifo);
    }
  });

  it('jumps from the field and explains a page outside the range', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    irAPagina(fixture, '99');
    fixture.detectChanges();

    expect(peticiones().length).toBe(0);
    expect(host(fixture).querySelector('.jump-error[role="alert"]')?.textContent).toContain(
      'Ingresa un número entre 1 y 13.',
    );

    // A valid page inside the block is still a local slice.
    irAPagina(fixture, '3');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(peticiones().length).toBe(0);
    expect(texto(fixture)).toContain('Página 3 de 13');
    expect(host(fixture).querySelector('.jump-error[role="alert"]')).toBeNull();
  });

  it('shows the skeleton only on the first load, never while a block changes', async () => {
    const fixture = await render();

    expect(host(fixture).querySelector('tbody tr.skeleton-row')).not.toBeNull();
    expect(host(fixture).querySelector('.pager')).toBeNull();

    peticiones()[0].flush(PRIMER_BLOQUE);
    await fixture.whenStable();

    boton(fixture, 'Siguiente').click();
    await fixture.whenStable();
    expect(host(fixture).querySelector('tbody tr.skeleton-row')).toBeNull();
    expect(filas(fixture).length).toBe(20);
  });

  it('names the cause of an empty result: the search, or an empty roster', () => {
    vi.useFakeTimers();

    const fixture = TestBed.createComponent(EmpleadosPage);
    fixture.detectChanges();

    peticiones()[0].flush(respuesta([], 0));
    fixture.detectChanges();

    const vacio = (): string => host(fixture).querySelector('td.empty')?.textContent?.trim() ?? '';
    expect(vacio()).toBe('Todavía no hay empleados activos.');
    expect(rangoMostrado(fixture)).toBe('Sin empleados');
    expect(texto(fixture)).toContain('Página 1 de 1');

    escribir(fixture, 'zzz');
    vi.advanceTimersByTime(300);

    const busqueda = peticiones();
    expect(busqueda.length).toBe(1);
    expect(busqueda[0].request.params.get('buscar')).toBe('zzz');
    busqueda[0].flush(respuesta([], 0));
    fixture.detectChanges();

    expect(vacio()).toBe('No hay empleados que coincidan con la búsqueda.');
  });

  it('validates the term before it travels and shows a backend 422 in the field', () => {
    vi.useFakeTimers();

    const fixture = TestBed.createComponent(EmpleadosPage);
    fixture.detectChanges();
    peticiones()[0].flush(PRIMER_BLOQUE);
    fixture.detectChanges();

    escribir(fixture, 'ana123');
    vi.advanceTimersByTime(300);

    // The client-side mirror of RN-07 catches it: no request, and the field
    // explains the format while the user is still typing.
    expect(peticiones().length).toBe(0);
    expect(host(fixture).querySelector('#buscar-error')?.textContent).toContain('solo dígitos');
    expect(campoBusqueda(fixture).getAttribute('aria-invalid')).toBe('true');

    escribir(fixture, 'ana');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    const busqueda = peticiones();
    expect(busqueda.length).toBe(1);
    expect(busqueda[0].request.params.get('buscar')).toBe('ana');
    expect(host(fixture).querySelector('#buscar-error')).toBeNull();

    // A stricter backend than the local mirror is still possible: Laravel's 422
    // carries the per-field sentence, and the typed term stays where the user
    // left it.
    busqueda[0].flush(
      {
        message: 'The given data was invalid.',
        errors: { buscar: ['El término de búsqueda no cumple el formato.'] },
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    fixture.detectChanges();

    expect(texto(fixture)).toContain('El término de búsqueda no cumple el formato.');
    expect(campoBusqueda(fixture).value).toBe('ana');
    expect(buscarBoton(fixture, 'Reintentar')).toBeUndefined();
  });

  it('debounces the search, drops the cached block and returns to page 1', () => {
    vi.useFakeTimers();

    const fixture = TestBed.createComponent(EmpleadosPage);
    fixture.detectChanges();
    peticiones()[0].flush(PRIMER_BLOQUE);
    fixture.detectChanges();

    // Leave page 1 first: a new term has to come back to it.
    boton(fixture, 'Siguiente').click();
    fixture.detectChanges();

    escribir(fixture, 'an');
    vi.advanceTimersByTime(100);
    escribir(fixture, 'ana');
    expect(peticiones().length).toBe(0);

    vi.advanceTimersByTime(300);

    const busquedas = peticiones();
    expect(busquedas.length).toBe(1);
    expect(busquedas[0].request.params.get('buscar')).toBe('ana');
    expect(busquedas[0].request.params.get('pagina')).toBe('1');
    expect(busquedas[0].request.params.get('por_pagina')).toBe('100');
    busquedas[0].flush(respuesta([ANA], 1));
    fixture.detectChanges();

    expect(texto(fixture)).toContain('Página 1 de 1');
    expect(filas(fixture).length).toBe(1);
  });

  it('changes the logical page size while the block stays at 100', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    boton(fixture, 'Siguiente').click();
    await fixture.whenStable();

    const selector = host(fixture).querySelector<HTMLSelectElement>('.page-size-select');
    expect(selector).not.toBeNull();
    expect(Array.from(selector?.options ?? []).map((option) => option.value)).toEqual([
      '10',
      '20',
      '50',
      '100',
    ]);
    expect(selector?.value).toBe('20');

    selector!.value = '50';
    selector!.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const cambio = peticiones();
    expect(cambio.length).toBe(1);
    // A different logical window, but still the largest block the API accepts.
    expect(cambio[0].request.params.get('por_pagina')).toBe('100');
    expect(cambio[0].request.params.get('pagina')).toBe('1');
    cambio[0].flush(PRIMER_BLOQUE);
    await fixture.whenStable();

    expect(filas(fixture).length).toBe(50);
    expect(rangoMostrado(fixture)).toBe('Mostrando 1–50 de 250');
    expect(texto(fixture)).toContain('Página 1 de 5');

    // Page 2 is inside the same block, so changing page costs no request.
    boton(fixture, 'Siguiente').click();
    await fixture.whenStable();
    expect(peticiones().length).toBe(0);
    expect(filas(fixture).length).toBe(50);
    expect(filas(fixture)[0][0]).toBe('10051');
  });

  it('writes the logical page to ?pagina= and reads it back on a deep link', async () => {
    await router.navigateByUrl('/?pagina=6');

    const fixture = TestBed.createComponent(EmpleadosPage);
    await fixture.whenStable();

    // A deep link opens where it says: page 6 needs block 2 straight away.
    const inicial = peticiones();
    expect(inicial.length).toBe(1);
    expect(inicial[0].request.params.get('pagina')).toBe('2');
    inicial[0].flush(SEGUNDO_BLOQUE);
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Página 6 de 13');
    expect(filas(fixture)[0][0]).toBe('10101');

    // A cache hit changes the URL without asking the endpoint again.
    boton(fixture, 'Siguiente').click();
    await fixture.whenStable();
    expect(peticiones().length).toBe(0);
    expect(router.url).toContain('pagina=7');

    // The browser's back button is the same path: the URL drives the page.
    await router.navigateByUrl('/?pagina=8');
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Página 8 de 13');
    expect(peticiones().length).toBe(0);

    // Page 1 has a canonical URL: the param disappears. Block 1 was never
    // loaded in this visit, so going back is a real block miss.
    boton(fixture, 'Primera').click();
    await fixture.whenStable();

    const vuelta = peticiones();
    expect(vuelta.length).toBe(1);
    expect(vuelta[0].request.params.get('pagina')).toBe('1');
    vuelta[0].flush(PRIMER_BLOQUE);
    await fixture.whenStable();

    expect(router.url).not.toContain('pagina=');
  });

  it('shows the wait the API asked for after a 429 and locks the retry', async () => {
    const fixture = await render();

    peticiones()[0].flush(
      {
        mensaje: 'Demasiadas consultas.',
        codigo: 'limite_consultas',
        reintentar_en_segundos: 37,
      },
      { status: 429, statusText: 'Too Many Requests' },
    );
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Hiciste demasiadas consultas. Espera 37 segundos.');
    expect(texto(fixture)).toContain('limite_consultas');
    expect(host(fixture).querySelector('[role="alert"]')).not.toBeNull();
    expect(boton(fixture, 'Reintentar').disabled).toBe(true);
    expect(boton(fixture, 'Actualizar').disabled).toBe(true);
  });

  it('keeps a search typed during a 429 and sends it when the wait is over', () => {
    vi.useFakeTimers();

    const fixture = TestBed.createComponent(EmpleadosPage);
    fixture.detectChanges();

    peticiones()[0].flush(
      {
        mensaje: 'Demasiadas consultas.',
        codigo: 'limite_consultas',
        reintentar_en_segundos: 2,
      },
      { status: 429, statusText: 'Too Many Requests' },
    );
    fixture.detectChanges();

    expect(boton(fixture, 'Reintentar').disabled).toBe(true);

    // The API asked for silence, not for lost typing: the term waits its turn.
    escribir(fixture, 'ana');
    vi.advanceTimersByTime(300);
    expect(peticiones().length).toBe(0);

    vi.advanceTimersByTime(2000);

    const diferida = peticiones();
    expect(diferida.length).toBe(1);
    expect(diferida[0].request.params.get('buscar')).toBe('ana');
    expect(diferida[0].request.params.get('pagina')).toBe('1');
    expect(diferida[0].request.params.get('por_pagina')).toBe('100');
    diferida[0].flush(respuesta([ANA], 1));
    fixture.detectChanges();

    expect(host(fixture).querySelector('[role="alert"]')).toBeNull();
    expect(texto(fixture)).toContain('Ana Martínez');
  });

  it('offers a retry when the service is unavailable, and the retry refetches', async () => {
    const fixture = await render();

    peticiones()[0].flush(
      { mensaje: 'El servicio no está disponible.', codigo: 'servicio_no_disponible' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    await fixture.whenStable();

    expect(texto(fixture)).toContain('El servicio no está disponible. Reintenta en unos segundos.');

    const reintentar = boton(fixture, 'Reintentar');
    expect(reintentar.disabled).toBe(false);
    reintentar.click();
    await fixture.whenStable();

    await responder(fixture, respuesta([ANA]));

    expect(texto(fixture)).toContain('Ana Martínez');
    expect(host(fixture).querySelector('[role="alert"]')).toBeNull();
  });

  it('retries the block of a failed jump, not the page that stayed on screen', async () => {
    const fixture = await render();
    await responder(fixture, PRIMER_BLOQUE);

    boton(fixture, 'Última').click();
    await fixture.whenStable();

    const salto = peticiones();
    expect(salto.length).toBe(1);
    expect(salto[0].request.params.get('pagina')).toBe('3');
    salto[0].flush(
      { mensaje: 'El servicio no está disponible.', codigo: 'servicio_no_disponible' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    await fixture.whenStable();

    // The roster stays on page 1: the jump never landed.
    expect(texto(fixture)).toContain('Página 1 de 13');
    expect(filas(fixture)[0][0]).toBe('10001');

    boton(fixture, 'Reintentar').click();
    await fixture.whenStable();

    const reintento = peticiones();
    expect(reintento.length).toBe(1);
    // The retry remembers page 13, not the visible page 1.
    expect(reintento[0].request.params.get('pagina')).toBe('3');
    reintento[0].flush(TERCER_BLOQUE);
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Página 13 de 13');
    expect(filas(fixture)[0][0]).toBe('10241');
  });

  it('explains a permission failure and shows the contract code', async () => {
    const fixture = await render();

    peticiones()[0].flush(
      { mensaje: 'No autorizado para buscar.', codigo: 'permiso_denegado' },
      { status: 403, statusText: 'Forbidden' },
    );
    await fixture.whenStable();

    expect(texto(fixture)).toContain('No tienes permisos para consultar el listado de empleados.');
    expect(texto(fixture)).toContain('permiso_denegado');
    // Nothing to retry: the answer will not change by asking again.
    expect(buscarBoton(fixture, 'Reintentar')).toBeUndefined();
  });

  it('sends the user back to the login when the session expired', async () => {
    sessionStorage.setItem('utn-rh.token', 'token-vencido');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = await render();
    peticiones()[0].flush(
      { mensaje: 'No autenticado.' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Tu sesión venció. Vuelve a iniciar sesión.');

    boton(fixture, 'Iniciar sesión').click();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(sessionStorage.getItem('utn-rh.token')).toBeNull();
  });

  it('blames the connection when the request never reached the server', async () => {
    const fixture = await render();

    peticiones()[0].error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();

    expect(texto(fixture)).toContain('No pudimos conectar con el servidor. Revisa tu conexión.');
    expect(boton(fixture, 'Reintentar')).toBeDefined();
  });

  it('opens the record of the clicked row and asks for that employee', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA, LUIS]));

    // The second row is Luis, so a click on it must address his key (`2`), not
    // the first row's and not his `num_empleado`.
    const cuerpo = host(fixture).querySelectorAll('tbody tr');
    cuerpo[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();

    const ficha = httpMock.expectOne(`${URL_FICHA}/${LUIS.id}`);
    expect(ficha.request.method).toBe('GET');
    ficha.flush({ data: fichaDe(LUIS.id, LUIS.nombre) });
    httpMock.expectOne(`${URL_FICHA}/${LUIS.id}/historial-bajas`).flush({ data: [] });
    await fixture.whenStable();

    // The panel is the one mounted by the screen, with the row's record inside.
    expect(host(fixture).querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(host(fixture).querySelector('.bar-name')?.textContent?.trim()).toBe('Luis Ramírez');
    expect(host(fixture).querySelector('.head-meta')?.textContent?.trim()).toBe(
      'No. de empleado 2',
    );
  });

  it('opens the same record from the name button without firing the row click twice', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA, LUIS]));

    const nombre = host(fixture).querySelector<HTMLButtonElement>(
      'tbody tr:nth-child(2) app-row-link button',
    );
    expect(nombre?.getAttribute('aria-label')).toBe('Ver la ficha de Luis Ramírez');

    // The button sits inside the row, so its click bubbles. One activation must
    // reach `abrirFicha` once, not twice: the second call would ask again for a
    // record that is already open.
    const abrir = vi.spyOn(fixture.componentInstance, 'abrirFicha');
    nombre?.click();
    await fixture.whenStable();

    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir.mock.calls[0][0]).toMatchObject({ id: LUIS.id, nombre: LUIS.nombre });

    const ficha = httpMock.expectOne(`${URL_FICHA}/${LUIS.id}`);
    ficha.flush({ data: fichaDe(LUIS.id, LUIS.nombre) });
    httpMock.expectOne(`${URL_FICHA}/${LUIS.id}/historial-bajas`).flush({ data: [] });
    await fixture.whenStable();

    expect(host(fixture).querySelector('.bar-name')?.textContent?.trim()).toBe('Luis Ramírez');
  });

  it('asks the roster again after a termination so the worker disappears', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA, LUIS]));

    // The panel reports the act and the page owns the refresh: the endpoint
    // filters inactive workers out, so the row has to disappear.
    const panel = fixture.debugElement.query(By.directive(FichaDrawer))
      .componentInstance as FichaDrawer;
    panel.bajaRegistrada.emit();
    await fixture.whenStable();

    const recarga = peticiones();
    expect(recarga.length).toBe(1);
    expect(recarga[0].request.params.get('pagina')).toBe('1');
    expect(recarga[0].request.params.get('por_pagina')).toBe('100');
    recarga[0].flush(respuesta([ANA], 1));
    await fixture.whenStable();

    expect(filas(fixture).length).toBe(1);
    expect(texto(fixture)).not.toContain('Luis Ramírez');
  });

  it('toasts the number and asks the roster again after a registration', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA]));

    const toast = TestBed.inject(ToastService);
    // The folder reports the act; the page owns the announcement and the reload,
    // exactly as it owns the refresh after a termination.
    const alta = fixture.debugElement.query(By.directive(AltaDrawer))
      .componentInstance as AltaDrawer;

    alta.registrado.emit({ id: 42, num_empleado: '12345', nombre: 'Ana Martínez' });
    await fixture.whenStable();

    const avisos = toast.toasts();
    expect(avisos.length).toBe(1);
    expect(avisos[0].type).toBe('success');
    expect(avisos[0].title).toBe('Empleado registrado.');
    expect(avisos[0].message).toBe('Número de empleado 12345.');

    const recarga = peticiones();
    expect(recarga.length).toBe(1);
    expect(recarga[0].request.params.get('pagina')).toBe('1');
    recarga[0].flush(respuesta([ANA]));
    await fixture.whenStable();

    expect(filas(fixture).length).toBe(1);
  });
});
