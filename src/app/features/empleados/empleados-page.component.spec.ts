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

/** One served page. `total` drives the counters, `datos` is what the table shows. */
function pagina(meta: { pagina: number; total: number }, datos: EmpleadoPadron[]): PadronResponse {
  return {
    datos,
    meta: {
      ...meta,
      por_pagina: 20,
      total_paginas: meta.total === 0 ? 0 : Math.ceil(meta.total / 20),
    },
    enlaces: { anterior: null, siguiente: null },
  };
}

const PAGINA_UNO = pagina({ pagina: 1, total: 42 }, [ANA, LUIS]);
const PAGINA_DOS = pagina({ pagina: 2, total: 42 }, [ANA]);
const PAGINA_TRES = pagina({ pagina: 3, total: 42 }, [LUIS]);
const SIN_EMPLEADOS = pagina({ pagina: 1, total: 0 }, []);

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

/** Body rows, each as the text of its four cells. */
function filas(fixture: ComponentFixture<EmpleadosPage>): string[][] {
  return Array.from(host(fixture).querySelectorAll('tbody tr')).map((fila) =>
    Array.from(fila.querySelectorAll('td')).map((celda) => celda.textContent?.trim() ?? ''),
  );
}

function encabezados(fixture: ComponentFixture<EmpleadosPage>): string[] {
  return Array.from(host(fixture).querySelectorAll('th[scope="col"]')).map(
    (celda) => celda.textContent?.trim() ?? '',
  );
}

describe('EmpleadosPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    sessionStorage.clear();
    patchDialogPrototype();
    await TestBed.configureTestingModule({
      imports: [EmpleadosPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The throttle countdown runs on a real interval: restore the clock before
    // tearing the fixture down so the cleanup reaches the real `clearInterval`.
    vi.useRealTimers();
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  /** Creates the screen; the constructor already asked for the first page. */
  async function render(): Promise<ComponentFixture<EmpleadosPage>> {
    const fixture = TestBed.createComponent(EmpleadosPage);
    await fixture.whenStable();
    return fixture;
  }

  /** Every request the screen sent to the endpoint and has not been answered yet. */
  function peticiones(): TestRequest[] {
    return httpMock.match((request) => request.url === URL_PADRON);
  }

  /** Answers the single request in flight with one page. */
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

  it('renders one row per employee with the four columns of the roster', async () => {
    const fixture = await render();
    await responder(fixture, PAGINA_UNO);

    expect(encabezados(fixture)).toEqual(['Núm. empleado', 'Nombre', 'Área', 'Estado']);

    const cuerpo = filas(fixture);
    expect(cuerpo.length).toBe(2);
    expect(cuerpo[0]).toEqual(['12345', 'Ana Martínez', 'Área A', 'Activo']);
    expect(cuerpo[1]).toEqual(['12346', 'Luis Ramírez', '—', 'Baja']);
  });

  it('leads to the registration of a new employee from the header', async () => {
    const fixture = await render();
    peticiones()[0].flush(PAGINA_UNO);
    await fixture.whenStable();

    // A real link, so the alta is reachable with the middle click, the context
    // menu and the keyboard.
    const alta = host(fixture).querySelector<HTMLAnchorElement>('a.new-employee');
    expect(alta?.getAttribute('href')).toBe('/empleados/alta');
    expect(alta?.textContent?.trim()).toBe('Nuevo empleado');
  });

  it('shows the placeholder for a missing area and the state as a badge', async () => {
    const fixture = await render();
    await responder(fixture, PAGINA_UNO);

    const cuerpo = host(fixture).querySelectorAll('tbody tr');
    const area = cuerpo[1].querySelectorAll('td')[2];
    expect(area.textContent?.trim()).toBe('—');

    const activo = cuerpo[0].querySelector('.badge');
    expect(activo?.textContent?.trim()).toBe('Activo');
    expect(activo?.classList.contains('is-activo')).toBe(true);

    const baja = cuerpo[1].querySelector('.badge');
    expect(baja?.textContent?.trim()).toBe('Baja');
    expect(baja?.classList.contains('is-baja')).toBe(true);
  });

  it('lists the range and the page it is showing', async () => {
    const fixture = await render();
    await responder(fixture, PAGINA_UNO);

    expect(texto(fixture)).toContain('Mostrando 1–20 de 42');
    expect(texto(fixture)).toContain('Página 1 de 3');
    expect(boton(fixture, 'Anterior').disabled).toBe(true);
    expect(boton(fixture, 'Siguiente').disabled).toBe(false);
  });

  it('debounces the search and asks again from the first page', () => {
    vi.useFakeTimers();

    const fixture = TestBed.createComponent(EmpleadosPage);
    fixture.detectChanges();

    const [inicial] = peticiones();
    expect(inicial.request.params.get('pagina')).toBe('1');
    expect(inicial.request.params.has('buscar')).toBe(false);
    inicial.flush(PAGINA_UNO);
    fixture.detectChanges();

    // Leave page 1 first: a new term has to come back to it.
    boton(fixture, 'Siguiente').click();
    fixture.detectChanges();

    const [segunda] = peticiones();
    expect(segunda.request.params.get('pagina')).toBe('2');
    segunda.flush(PAGINA_DOS);
    fixture.detectChanges();

    // Two keystrokes inside the window are one request, not two.
    escribir(fixture, 'an');
    vi.advanceTimersByTime(100);
    escribir(fixture, 'ana');
    expect(peticiones().length).toBe(0);

    vi.advanceTimersByTime(300);

    const busquedas = peticiones();
    expect(busquedas.length).toBe(1);
    expect(busquedas[0].request.params.get('buscar')).toBe('ana');
    expect(busquedas[0].request.params.get('pagina')).toBe('1');
    busquedas[0].flush(SIN_EMPLEADOS);
    fixture.detectChanges();

    expect(texto(fixture)).toContain('Página 1 de 1');
  });

  it('walks to the next page and stops at the last one', async () => {
    const fixture = await render();
    await responder(fixture, PAGINA_UNO);

    boton(fixture, 'Siguiente').click();
    await fixture.whenStable();

    const segunda = peticiones();
    expect(segunda.length).toBe(1);
    expect(segunda[0].request.params.get('pagina')).toBe('2');
    segunda[0].flush(PAGINA_DOS);
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Página 2 de 3');

    boton(fixture, 'Siguiente').click();
    await fixture.whenStable();

    const tercera = peticiones();
    expect(tercera[0].request.params.get('pagina')).toBe('3');
    tercera[0].flush(PAGINA_TRES);
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Mostrando 41–42 de 42');
    expect(boton(fixture, 'Siguiente').disabled).toBe(true);
    expect(boton(fixture, 'Anterior').disabled).toBe(false);

    // A click on a disabled button must not ask for a page that does not exist.
    boton(fixture, 'Siguiente').click();
    await fixture.whenStable();
    expect(peticiones().length).toBe(0);
  });

  it('asks for the previous page and stops at the first one', async () => {
    const fixture = await render();
    await responder(fixture, PAGINA_UNO);

    boton(fixture, 'Siguiente').click();
    await fixture.whenStable();
    peticiones()[0].flush(PAGINA_DOS);
    await fixture.whenStable();

    boton(fixture, 'Anterior').click();
    await fixture.whenStable();

    const vuelta = peticiones();
    expect(vuelta[0].request.params.get('pagina')).toBe('1');
    vuelta[0].flush(PAGINA_UNO);
    await fixture.whenStable();

    expect(boton(fixture, 'Anterior').disabled).toBe(true);

    boton(fixture, 'Anterior').click();
    await fixture.whenStable();
    expect(peticiones().length).toBe(0);
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

    expect(texto(fixture)).toContain('Hiciste demasiadas consultas. Esperá 37 segundos.');
    expect(texto(fixture)).toContain('limite_consultas');
    expect(host(fixture).querySelector('[role="alert"]')).not.toBeNull();
    expect(boton(fixture, 'Reintentar').disabled).toBe(true);
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
    diferida[0].flush(PAGINA_UNO);
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

    expect(texto(fixture)).toContain('El servicio no está disponible. Reintentá en unos segundos.');

    const reintentar = boton(fixture, 'Reintentar');
    expect(reintentar.disabled).toBe(false);
    reintentar.click();
    await fixture.whenStable();

    await responder(fixture, PAGINA_UNO);

    expect(texto(fixture)).toContain('Ana Martínez');
    expect(host(fixture).querySelector('[role="alert"]')).toBeNull();
  });

  it('explains a permission failure and shows the contract code', async () => {
    const fixture = await render();

    peticiones()[0].flush(
      { mensaje: 'No autorizado para buscar.', codigo: 'permiso_denegado' },
      { status: 403, statusText: 'Forbidden' },
    );
    await fixture.whenStable();

    expect(texto(fixture)).toContain('No tenés permisos para consultar el padrón.');
    expect(texto(fixture)).toContain('permiso_denegado');
    // Nothing to retry: the answer will not change by asking again.
    expect(buscarBoton(fixture, 'Reintentar')).toBeUndefined();
  });

  it('sends the user back to the login when the session expired', async () => {
    sessionStorage.setItem('utn-rh.token', 'token-vencido');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = await render();
    peticiones()[0].flush(
      { mensaje: 'No autenticado.' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Tu sesión venció. Volvé a iniciar sesión.');

    boton(fixture, 'Iniciar sesión').click();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(sessionStorage.getItem('utn-rh.token')).toBeNull();
  });

  it('blames the connection when the request never reached the server', async () => {
    const fixture = await render();

    peticiones()[0].error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();

    expect(texto(fixture)).toContain('No pudimos conectar con el servidor. Revisá tu conexión.');
    expect(boton(fixture, 'Reintentar')).toBeDefined();
  });

  it('names the cause of an empty result: the search, or an empty roster', () => {
    vi.useFakeTimers();

    const fixture = TestBed.createComponent(EmpleadosPage);
    fixture.detectChanges();

    peticiones()[0].flush(SIN_EMPLEADOS);
    fixture.detectChanges();

    const vacio = (): string => host(fixture).querySelector('td.empty')?.textContent?.trim() ?? '';
    expect(vacio()).toBe('Todavía no hay empleados activos.');

    escribir(fixture, 'zzz');
    vi.advanceTimersByTime(300);
    peticiones()[0].flush(SIN_EMPLEADOS);
    fixture.detectChanges();

    expect(vacio()).toBe('No hay empleados que coincidan con la búsqueda.');
  });

  it('changes the page size and restarts at the first page', async () => {
    const fixture = await render();
    peticiones()[0].flush(PAGINA_UNO);
    fixture.detectChanges();

    // Move away from page 1 first: a size change has to come back to it.
    boton(fixture, 'Siguiente').click();
    fixture.detectChanges();
    peticiones()[0].flush(PAGINA_DOS);
    fixture.detectChanges();

    const selector = host(fixture).querySelector<HTMLSelectElement>('#porPagina');
    expect(selector).not.toBeNull();
    // 10, 20, 50, 100: the contract caps it at 100.
    expect(Array.from(selector?.options ?? []).map((option) => option.value)).toEqual([
      '10',
      '20',
      '50',
      '100',
    ]);

    selector!.value = '50';
    selector!.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const [cambio] = peticiones();
    expect(cambio.request.params.get('por_pagina')).toBe('50');
    expect(cambio.request.params.get('pagina')).toBe('1');
  });

  it('holds the skeleton of the table and both paging ends while a page loads', async () => {
    const fixture = await render();

    // No answer yet: the table shows its own skeleton and nothing claims a total.
    expect(host(fixture).querySelector('tbody tr.skeleton-row')).not.toBeNull();
    expect(host(fixture).querySelector('.pager')).toBeNull();

    peticiones()[0].flush(PAGINA_UNO);
    await fixture.whenStable();

    boton(fixture, 'Siguiente').click();
    await fixture.whenStable();

    expect(host(fixture).querySelector('tbody tr.skeleton-row')).not.toBeNull();
    expect(boton(fixture, 'Anterior').disabled).toBe(true);
    expect(boton(fixture, 'Siguiente').disabled).toBe(true);
    expect(boton(fixture, 'Actualizar').disabled).toBe(true);

    peticiones()[0].flush(PAGINA_DOS);
    await fixture.whenStable();
  });

  it('opens the record of the clicked row and asks for that employee', async () => {
    const fixture = await render();
    await responder(fixture, PAGINA_UNO);

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
    await responder(fixture, PAGINA_UNO);

    const nombre = host(fixture).querySelector<HTMLButtonElement>(
      'tbody tr:nth-child(2) .name-button',
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
    await responder(fixture, PAGINA_UNO);

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

    const confirmar = Array.from(
      host(fixture).querySelectorAll<HTMLButtonElement>('app-baja-modal button'),
    ).find((button) => (button.textContent ?? '').includes('Dar de baja'));
    confirmar?.click();
    await fixture.whenStable();

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
    await fixture.whenStable();

    // The drawer left, and the page asked the roster for the page on screen: the
    // endpoint filters inactive workers out, so the row is gone by now.
    expect(host(fixture).querySelector('app-ficha-drawer dialog')?.hasAttribute('open')).toBe(
      false,
    );

    const recarga = peticiones();
    expect(recarga.length).toBe(1);
    expect(recarga[0].request.params.get('pagina')).toBe('1');
    recarga[0].flush(pagina({ pagina: 1, total: 41 }, [ANA]));
    await fixture.whenStable();

    expect(filas(fixture).length).toBe(1);
    expect(texto(fixture)).not.toContain('Luis Ramírez');
  });
});
