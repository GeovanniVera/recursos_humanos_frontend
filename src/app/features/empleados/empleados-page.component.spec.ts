import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { FichaEmpleado } from '../../core/empleados/ficha.models';
import { EmpleadoPadron, PadronResponse } from '../../core/padron/padron.models';
import { EmpleadosPage } from './empleados-page.component';

const URL_PADRON = `${environment.apiBaseUrl}/padron`;
const URL_FICHA = `${environment.apiBaseUrl}/empleados`;
const URL_MOTIVOS = `${environment.apiBaseUrl}/catalogos/motivos-baja`;

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
      municipio: 'Nezahualcóyotl',
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
        campos_faltantes: ['curp', 'municipio'],
      },
    },
  };
}

const ANA: EmpleadoPadron = {
  id: 1,
  num_empleado: '12345',
  nombre: 'Ana Martínez',
  area: { id: 3, nombre: 'Área A' },
  estado: 'Activo',
};

const LUIS: EmpleadoPadron = {
  id: 2,
  num_empleado: '12346',
  nombre: 'Luis Ramírez',
  area: null,
  estado: 'Baja',
};

function rango(desde: number, hasta: number): number[] {
  return Array.from({ length: hasta - desde + 1 }, (_, index) => desde + index);
}

function empleado(id: number): EmpleadoPadron {
  return {
    id,
    num_empleado: String(10000 + id),
    nombre: `Empleado ${id}`,
    area: null,
    estado: 'Activo',
  };
}

/** One answer of the endpoint. `total` is the size of the whole filtered set. */
function respuesta(datos: EmpleadoPadron[], total = datos.length, pagina = 1): PadronResponse {
  return {
    datos,
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
function bloqueDe(pagina: number, total: number, desde: number, hasta: number): PadronResponse {
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
 * The sentence of the leading flag lives in a `.visually-hidden` span inside the
 * first cell, so it is dropped here: this helper reads what the eye sees.
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
    return httpMock.match((request) => request.url === URL_PADRON);
  }

  /** Answers the single request in flight with one block. */
  async function responder(
    fixture: ComponentFixture<EmpleadosPage>,
    cuerpo: PadronResponse,
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

  it('renders one row per employee with the three columns of the roster', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA, LUIS]));

    expect(encabezados(fixture)).toEqual(['Núm. empleado', 'Nombre', 'Área']);

    const cuerpo = filas(fixture);
    expect(cuerpo.length).toBe(2);
    expect(cuerpo[0]).toEqual(['12345', 'Ana Martínez', 'Área A']);
    expect(cuerpo[1]).toEqual(['12346', 'Luis Ramírez', '—']);
  });

  it('leads to the registration of a new employee from the header', async () => {
    const fixture = await render();
    peticiones()[0].flush(respuesta([ANA]));
    await fixture.whenStable();

    // A real link, so the alta is reachable with the middle click, the context
    // menu and the keyboard.
    const alta = host(fixture).querySelector<HTMLAnchorElement>('a.new-employee');
    expect(alta?.getAttribute('href')).toBe('/empleados/alta');
    expect(alta?.textContent?.trim()).toBe('Nuevo empleado');
  });

  it('shows the placeholder for a missing area and the state as a leading flag', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA, LUIS]));

    const cuerpo = host(fixture).querySelectorAll('tbody tr');
    const area = cuerpo[1].querySelectorAll('td')[2];
    expect(area.textContent?.trim()).toBe('—');

    // The flag is the first thing in the number cell, and the table is asked for
    // the positioned cell that lets it anchor there instead of the viewport.
    expect(host(fixture).querySelector('.table')?.classList.contains('has-leading-decoration')).toBe(
      true,
    );
    expect(cuerpo[0].querySelector('td')?.firstElementChild?.tagName.toLowerCase()).toBe(
      'app-row-flag',
    );

    const activo = cuerpo[0].querySelector('app-row-flag');
    expect(activo?.querySelector('.row-flag')?.classList.contains('is-activo')).toBe(true);
    expect(activo?.querySelector('.visually-hidden')?.textContent?.trim()).toBe('Estado: Activo');

    // The terminated row stays distinguishable without a text pill: its tone and
    // its announcement carry the state.
    const baja = cuerpo[1].querySelector('app-row-flag');
    expect(baja?.querySelector('.row-flag')?.classList.contains('is-baja')).toBe(true);
    expect(baja?.querySelector('.visually-hidden')?.textContent?.trim()).toBe('Estado: Baja');
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

  it('validates the term before it travels and keeps a backend 400 term in the field', () => {
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

    // A stricter backend than the local mirror is still possible: its sentence
    // is the one shown, and the typed term stays where the user left it.
    busqueda[0].flush(
      {
        mensaje: 'El término de búsqueda no cumple el formato.',
        codigo: 'parametros_invalidos',
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(texto(fixture)).toContain('El término de búsqueda no cumple el formato.');
    expect(texto(fixture)).toContain('parametros_invalidos');
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

    expect(texto(fixture)).toContain('No tienes permisos para consultar el padrón.');
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
    await fixture.whenStable();

    // The panel is the one mounted by the screen, with the row's record inside.
    expect(host(fixture).querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(texto(fixture)).toContain('Ficha del trabajador');
    expect(texto(fixture)).toContain('Luis Ramírez');
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
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Luis Ramírez');
  });

  it('asks the roster again after a termination so the worker disappears', async () => {
    const fixture = await render();
    await responder(fixture, respuesta([ANA, LUIS]));

    // Open the record of the second row: only a loaded record offers the baja.
    host(fixture)
      .querySelectorAll('tbody tr')[1]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();

    httpMock.expectOne(`${URL_FICHA}/${LUIS.id}`).flush({ data: fichaDe(LUIS.id, LUIS.nombre) });
    await fixture.whenStable();

    const baja = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => (button.textContent ?? '').includes('Dar de baja'),
    );
    expect(baja?.disabled).toBe(false);
    baja?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_MOTIVOS).flush({
      data: [{ id: 4, clave: 'BAJA_TEMPORAL', descripcion: 'Baja temporal' }],
    });
    await fixture.whenStable();

    const motivo = host(fixture).querySelector<HTMLSelectElement>('app-baja-modal #baja-motivo');
    expect(motivo).not.toBeNull();
    motivo!.value = '4';
    motivo!.dispatchEvent(new Event('change'));

    const nota = host(fixture).querySelector<HTMLTextAreaElement>('app-baja-modal #baja-nota');
    expect(nota).not.toBeNull();
    nota!.value = 'Licencia por incapacidad ';
    nota!.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    vi.useFakeTimers();
    try {
      const confirmar = Array.from(
        host(fixture).querySelectorAll<HTMLButtonElement>('app-baja-modal button'),
      ).find((button) => (button.textContent ?? '').includes('Dar de baja'));
      confirmar?.click();
      fixture.detectChanges();

      const peticion = httpMock.expectOne(`${URL_FICHA}/${LUIS.id}/baja`);
      // The note travels trimmed, and nothing else travels with it.
      expect(peticion.request.body).toEqual({ motivo_id: 4, nota: 'Licencia por incapacidad' });
      peticion.flush({
        mensaje: 'Baja procesada exitosamente.',
        empleado: {
          id: LUIS.id,
          num_empleado: LUIS.num_empleado,
          nombre: LUIS.nombre,
          activo: false,
          fecha_baja: '2026-11-11',
          motivo_baja: 'Baja temporal',
          nota_baja: 'Licencia por incapacidad',
          baja_por: 1,
        },
      });
      fixture.detectChanges();

      // The drawer left, and the page asked the roster for the block on screen:
      // the endpoint filters inactive workers out, so the row is gone by now.
      expect(host(fixture).querySelector('app-ficha-drawer dialog')?.hasAttribute('open')).toBe(
        false,
      );

      const recarga = peticiones();
      expect(recarga.length).toBe(1);
      expect(recarga[0].request.params.get('pagina')).toBe('1');
      expect(recarga[0].request.params.get('por_pagina')).toBe('100');
      recarga[0].flush(respuesta([ANA], 1));
      fixture.detectChanges();
      vi.advanceTimersByTime(300);
      fixture.detectChanges();

      expect(filas(fixture).length).toBe(1);
      expect(texto(fixture)).not.toContain('Luis Ramírez');
    } finally {
      vi.useRealTimers();
    }
  });
});
