import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import {
  AreaCatalogo,
  CatalogoDiagnostico,
  CategoriaCatalogo,
  PuestoArea,
  PuestoCatalogo,
  PuestoCategoria,
} from '../../../core/catalogos/catalogos.models';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { CatalogosPage } from './catalogos-page.component';

const URL_CATALOGOS = `${environment.apiBaseUrl}/catalogos`;

/**
 * jsdom ships `HTMLDialogElement` without `showModal` / `close`. Opening the
 * assign dialog reaches the native API, so the spec provides it, exactly as the
 * modal and drawer specs do.
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

const ADMIN_PUESTO: PuestoCategoria = {
  id: 2,
  clave: 'ADMIN',
  tipo: 'administrativo',
  descripcion: 'Personal administrativo',
};

const MANDO_PUESTO: PuestoCategoria = {
  id: 3,
  clave: 'MANDO',
  tipo: 'mando_medio',
  descripcion: 'Mando medio',
};

const SISTEMAS_PUESTO: PuestoArea = { id: 3, nombre: 'Depto. Sistemas' };
const RECURSOS_PUESTO: PuestoArea = { id: 4, nombre: 'Depto. Recursos Humanos' };

const ANALISTA: PuestoCatalogo = {
  id: 7,
  nombre: 'Analista',
  activo: true,
  categoria: ADMIN_PUESTO,
  areas: [SISTEMAS_PUESTO],
};

const TECNICO: PuestoCatalogo = {
  id: 9,
  nombre: 'Técnico',
  activo: false,
  categoria: ADMIN_PUESTO,
  areas: [SISTEMAS_PUESTO],
};

const PROFESOR: PuestoCatalogo = {
  id: 10,
  nombre: 'Profesor de Asignatura',
  activo: true,
  categoria: MANDO_PUESTO,
  areas: [SISTEMAS_PUESTO, RECURSOS_PUESTO],
};

const COORDINADOR: PuestoCatalogo = {
  id: 8,
  nombre: 'Coordinador',
  activo: true,
  categoria: null,
  areas: [],
};

const ADMIN: CategoriaCatalogo = {
  id: 2,
  clave: 'ADMIN',
  tipo: 'administrativo',
  descripcion: 'Personal administrativo',
  activo: true,
};

const MANDO: CategoriaCatalogo = {
  id: 3,
  clave: 'MANDO',
  tipo: 'mando_medio',
  descripcion: 'Mando medio',
  activo: true,
};

/** Deactivated: the catalog lists it, the post selector does not offer it. */
const DIRECTIVO: CategoriaCatalogo = {
  id: 5,
  clave: 'DIR',
  tipo: 'directivo',
  descripcion: 'Directivo',
  activo: false,
};

const RECTORIA: AreaCatalogo = {
  id: 1,
  padre_id: null,
  nombre: 'Rectoría',
  asignable: false,
  activo: true,
};

const SISTEMAS: AreaCatalogo = {
  id: 3,
  padre_id: 1,
  nombre: 'Depto. Sistemas',
  asignable: true,
  activo: true,
};

const RECURSOS: AreaCatalogo = {
  id: 4,
  padre_id: 1,
  nombre: 'Depto. Recursos Humanos',
  asignable: true,
  activo: true,
};

const DIAGNOSTICO: CatalogoDiagnostico = {
  puestos_sin_area: 1,
  puestos_sin_empleados: 1,
  categorias_sin_uso: 0,
  empleados_sin_area: 3,
  puestos_con_clasificacion_contradicha: [
    { puesto: 'Coordinador', tipo_puesto: 'mando_medio', empleados_en_contra: 2 },
  ],
};

/**
 * Everything `GET` answers in one load, as the contract sends it: posts ordered
 * by area and then by name, with the unassigned ones in the same list.
 */
const SNAPSHOT = {
  puestos: [ANALISTA, TECNICO, PROFESOR, COORDINADOR],
  categorias: [ADMIN, MANDO, DIRECTIVO],
  areas: [RECTORIA, SISTEMAS, RECURSOS],
  diagnostico: DIAGNOSTICO,
};

function host(fixture: ComponentFixture<CatalogosPage>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function texto(fixture: ComponentFixture<CatalogosPage>): string {
  return host(fixture).textContent ?? '';
}

/** Native `<button>` found by the label it prints. */
function buscarBoton(
  fixture: ComponentFixture<CatalogosPage>,
  etiqueta: string,
): HTMLButtonElement | undefined {
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
    (elemento) => (elemento.textContent ?? '').trim() === etiqueta,
  );
}

function boton(fixture: ComponentFixture<CatalogosPage>, etiqueta: string): HTMLButtonElement {
  const encontrado = buscarBoton(fixture, etiqueta);
  if (!encontrado) {
    throw new Error(`No button labelled ${etiqueta}`);
  }
  return encontrado;
}

/** Native control found by its accessible name. */
function control<T extends HTMLElement>(
  fixture: ComponentFixture<CatalogosPage>,
  etiqueta: string,
): T {
  const encontrado = host(fixture).querySelector<T>(`[aria-label="${etiqueta}"]`);
  if (encontrado === null) {
    throw new Error(`No control labelled ${etiqueta}`);
  }
  return encontrado;
}

/** Body rows, each as the text of its cells. */
function filas(fixture: ComponentFixture<CatalogosPage>): string[][] {
  return Array.from(host(fixture).querySelectorAll('tbody tr')).map((fila) =>
    Array.from(fila.querySelectorAll('td')).map((celda) => celda.textContent?.trim() ?? ''),
  );
}

/** Names of the rows on screen, in the order they are printed. */
function nombres(fixture: ComponentFixture<CatalogosPage>): string[] {
  return filas(fixture).map((fila) => fila[1]);
}

/** The body row of one post, found by the name it prints. */
function filaPuesto(fixture: ComponentFixture<CatalogosPage>, nombre: string): HTMLTableRowElement {
  const fila = Array.from(host(fixture).querySelectorAll<HTMLTableRowElement>('tbody tr')).find(
    (candidata) => (candidata.querySelectorAll('td')[1]?.textContent ?? '').trim() === nombre,
  );
  if (!fila) {
    throw new Error(`No row for ${nombre}`);
  }
  return fila;
}

/** Text of every cell of the row of one post. */
function celdas(fixture: ComponentFixture<CatalogosPage>, nombre: string): string[] {
  return Array.from(filaPuesto(fixture, nombre).querySelectorAll('td')).map(
    (celda) => celda.textContent?.trim() ?? '',
  );
}

/** Areas printed as chips inside the row of one post. */
function areasEnFila(fixture: ComponentFixture<CatalogosPage>, nombre: string): string[] {
  return Array.from(filaPuesto(fixture, nombre).querySelectorAll('.area-name')).map((chip) =>
    (chip.textContent ?? '').trim(),
  );
}

/** The "remove this area" button of one row. */
function quitarArea(
  fixture: ComponentFixture<CatalogosPage>,
  nombre: string,
  area: string,
): HTMLButtonElement {
  const encontrado = filaPuesto(fixture, nombre).querySelector<HTMLButtonElement>(
    `[aria-label="Quitar ${area} del puesto"]`,
  );
  if (encontrado === null) {
    throw new Error(`No remove button for ${area} in the row of ${nombre}`);
  }
  return encontrado;
}

describe('CatalogosPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    sessionStorage.clear();
    patchDialogPrototype();
    await TestBed.configureTestingModule({
      imports: [CatalogosPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(ToastService).dismissAll();
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  /**
   * The single request in flight for one path, asserting the exact query string.
   *
   * The string overload of `expectOne` compares against `urlWithParams`, so it
   * cannot tell a filtered read from an unfiltered one; matching on the path plus
   * the expected params is what proves which filters the screen sent.
   */
  function peticion(ruta: string, params: Readonly<Record<string, string>> = {}): TestRequest {
    return httpMock.expectOne((candidate) => {
      if (candidate.url !== `${URL_CATALOGOS}${ruta}`) {
        return false;
      }

      const enviados = candidate.params.keys().sort();
      const esperados = Object.keys(params).sort();

      if (enviados.length !== esperados.length) {
        return false;
      }

      return esperados.every((clave) => candidate.params.get(clave) === params[clave]);
    });
  }

  /** Answers the four reads of one snapshot. */
  async function responder(
    fixture: ComponentFixture<CatalogosPage>,
    cuerpo = SNAPSHOT,
  ): Promise<void> {
    peticion('/puestos').flush({ data: cuerpo.puestos });
    peticion('/categorias').flush({ data: cuerpo.categorias });
    peticion('/areas').flush({ data: cuerpo.areas });
    // The diagnostics answer flat: no `data` envelope.
    peticion('/diagnostico').flush(cuerpo.diagnostico);
    await fixture.whenStable();
  }

  /** Creates the screen with its whole snapshot on screen. */
  async function render(): Promise<ComponentFixture<CatalogosPage>> {
    const fixture = TestBed.createComponent(CatalogosPage);
    await fixture.whenStable();
    await responder(fixture);
    return fixture;
  }

  it('loads the diagnostics and the posts, and renders the counters', async () => {
    const fixture = await render();

    // One line per finding, each with its own figure.
    expect(texto(fixture)).toContain('1 puesto sin área');
    expect(texto(fixture)).toContain('1 puesto sin empleados');
    expect(texto(fixture)).toContain('1 clasificación en contra');
    // The banner is a warning, so it announces itself.
    expect(host(fixture).querySelector('[role="alert"]')).not.toBeNull();

    const contadores = Array.from(host(fixture).querySelectorAll('.counter-text')).map((linea) =>
      (linea.textContent ?? '').trim(),
    );
    expect(contadores.length).toBe(5);

    // The whole list is on screen, in the order the endpoint sent it.
    expect(nombres(fixture)).toEqual([
      'Analista',
      'Técnico',
      'Profesor de Asignatura',
      'Coordinador',
    ]);
  });

  it('prints the areas and the state of each post as text', async () => {
    const fixture = await render();

    // Name, category, areas, state. A column of counts would be a figure the
    // backend never sent, so the table has none.
    expect(celdas(fixture, 'Analista')[3]).toBe('Depto. Sistemas');
    expect(celdas(fixture, 'Analista')[4]).toBe('Sí');
    expect(celdas(fixture, 'Técnico')[4]).toBe('No');
    // A post may belong to several areas, and to none.
    expect(areasEnFila(fixture, 'Profesor de Asignatura')).toEqual([
      'Depto. Sistemas',
      'Depto. Recursos Humanos',
    ]);
    expect(celdas(fixture, 'Coordinador')[3]).toBe('—');
  });

  it('shows no usage count and no row action', async () => {
    const fixture = await render();

    // The first header holds the "select the page" checkbox. There is no action
    // column: both writes of a row live in the cells themselves.
    const cabeceras = Array.from(host(fixture).querySelectorAll('thead th')).map((celda) =>
      (celda.textContent ?? '').trim(),
    );
    expect(cabeceras).toEqual(['', 'Nombre', 'Categoría', 'Áreas', 'Activo']);
    expect(host(fixture).querySelectorAll('thead th.actions').length).toBe(0);
    expect(texto(fixture)).not.toContain('Empleados');
  });

  it('asks the server for the posts with no area when that counter is reviewed', async () => {
    const fixture = await render();
    expect(nombres(fixture).length).toBe(4);

    control<HTMLButtonElement>(fixture, 'Revisar los puestos sin área').click();
    await fixture.whenStable();

    // "Sin área" is not a fact a row carries: it travels as a param.
    const consulta = peticion('/puestos', { sin_area: '1' });
    consulta.flush({ data: [COORDINADOR] });
    await fixture.whenStable();

    expect(nombres(fixture)).toEqual(['Coordinador']);
  });

  it('asks the server for the posts nobody holds when that counter is reviewed', async () => {
    const fixture = await render();

    control<HTMLButtonElement>(fixture, 'Revisar los puestos sin empleados').click();
    await fixture.whenStable();

    const consulta = peticion('/puestos', { sin_empleados: '1' });
    consulta.flush({ data: [PROFESOR] });
    await fixture.whenStable();

    expect(nombres(fixture)).toEqual(['Profesor de Asignatura']);
    // The chip says which finding is narrowing the table, and offers its way out.
    expect(texto(fixture)).toContain('Mostrando los puestos sin empleados');
  });

  it('sends the state filter as activo and never invents an area_id param', async () => {
    const fixture = await render();

    const estado = host(fixture).querySelector<HTMLSelectElement>('#puesto-estado');
    expect(estado).not.toBeNull();
    estado!.value = 'inactivos';
    estado!.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const consulta = peticion('/puestos', { activo: '0' });
    consulta.flush({ data: [TECNICO] });
    await fixture.whenStable();

    expect(nombres(fixture)).toEqual(['Técnico']);
  });

  it('filters by one concrete area on the client, by membership', async () => {
    const fixture = await render();

    const area = host(fixture).querySelector<HTMLSelectElement>('#puesto-area');
    expect(area).not.toBeNull();

    area!.value = '3';
    area!.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    // No request is made: `afterEach` would fail on a pending one. A post that
    // belongs to two areas shows up under both.
    expect(nombres(fixture)).toEqual(['Analista', 'Técnico', 'Profesor de Asignatura']);

    area!.value = '4';
    area!.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(nombres(fixture)).toEqual(['Profesor de Asignatura']);
  });

  it('replaces the warning with a success strip when there is nothing to review', async () => {
    const fixture = TestBed.createComponent(CatalogosPage);
    await fixture.whenStable();

    await responder(fixture, {
      ...SNAPSHOT,
      diagnostico: {
        puestos_sin_area: 0,
        puestos_sin_empleados: 0,
        categorias_sin_uso: 0,
        empleados_sin_area: 0,
        puestos_con_clasificacion_contradicha: [],
      },
    });

    const exito = host(fixture).querySelector('[role="status"]');
    expect(exito).not.toBeNull();
    expect(exito?.textContent).toContain('Catálogos mapeados');
    // Good news is a status, not an alert.
    expect(host(fixture).querySelector('[role="alert"]')).toBeNull();
  });

  it('selects every row of the page from the header checkbox', async () => {
    const fixture = await render();

    const cabecera = control<HTMLInputElement>(fixture, 'Seleccionar los puestos de esta página');
    cabecera.checked = true;
    cabecera.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(texto(fixture)).toContain('4 seleccionados');
  });

  it('changes only the category of a post, and offers the active categories', async () => {
    const fixture = await render();

    const selector = control<HTMLSelectElement>(fixture, 'Categoría de Analista');
    // The control starts on the category the row declares.
    expect(selector.value).toBe('2');

    // A deactivated category is not offered.
    const claves = Array.from(selector.options).map((opcion) => (opcion.textContent ?? '').trim());
    expect(claves.some((clave) => clave.startsWith('DIR'))).toBe(false);

    selector.value = '3';
    selector.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const cambio = peticion('/puestos/7');
    expect(cambio.request.method).toBe('PATCH');
    // The category is the only field the contract accepts.
    expect(cambio.request.body).toEqual({ categoria_cct_id: 3 });

    cambio.flush({ data: { ...ANALISTA, categoria: MANDO_PUESTO } });
    await fixture.whenStable();

    peticion('/diagnostico').flush(DIAGNOSTICO);
    await fixture.whenStable();

    expect(control<HTMLSelectElement>(fixture, 'Categoría de Analista').value).toBe('3');
  });

  it('puts the category back and explains it when the post has employees', async () => {
    const fixture = await render();

    const selector = control<HTMLSelectElement>(fixture, 'Categoría de Analista');
    selector.value = '3';
    selector.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    peticion('/puestos/7').flush(
      { mensaje: 'El puesto tiene empleados.', codigo: 'puesto_con_empleados' },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    // The server still holds the old category, so the control goes back to it...
    expect(selector.value).toBe('2');
    // ... and nothing is refreshed: a rejected write changed nothing.
    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts.length).toBe(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toBe(
      'Ese puesto tiene empleados activos: no se puede cambiar de categoría ni quitarle un área.',
    );
  });

  it('removes one area from a post without asking for confirmation', async () => {
    const fixture = await render();
    expect(areasEnFila(fixture, 'Profesor de Asignatura')).toEqual([
      'Depto. Sistemas',
      'Depto. Recursos Humanos',
    ]);

    quitarArea(fixture, 'Profesor de Asignatura', 'Depto. Recursos Humanos').click();
    await fixture.whenStable();

    const baja = peticion('/puestos/10/areas/4');
    expect(baja.request.method).toBe('DELETE');

    // The answer is flat, like the assign one.
    baja.flush({ desasociado: true });
    await fixture.whenStable();

    peticion('/diagnostico').flush(DIAGNOSTICO);
    await fixture.whenStable();

    expect(areasEnFila(fixture, 'Profesor de Asignatura')).toEqual(['Depto. Sistemas']);
    expect(TestBed.inject(ToastService).toasts().length).toBe(0);
  });

  it('keeps the area and explains it when the post still has employees there', async () => {
    const fixture = await render();

    quitarArea(fixture, 'Profesor de Asignatura', 'Depto. Recursos Humanos').click();
    await fixture.whenStable();

    peticion('/puestos/10/areas/4').flush(
      { mensaje: 'El puesto tiene empleados en esa área.', codigo: 'puesto_con_empleados' },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    // Nothing was removed, so the row is untouched and nothing is refreshed.
    expect(areasEnFila(fixture, 'Profesor de Asignatura')).toEqual([
      'Depto. Sistemas',
      'Depto. Recursos Humanos',
    ]);

    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts.length).toBe(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toBe(
      'Ese puesto tiene empleados activos: no se puede cambiar de categoría ni quitarle un área.',
    );
  });

  it('posts the selected rows and the chosen area when the modal is confirmed', async () => {
    const fixture = await render();

    // The handler reads the change, not the DOM state: the event is enough.
    control<HTMLInputElement>(fixture, 'Seleccionar Analista').dispatchEvent(new Event('change'));
    control<HTMLInputElement>(fixture, 'Seleccionar Coordinador').dispatchEvent(
      new Event('change'),
    );
    await fixture.whenStable();

    expect(texto(fixture)).toContain('2 seleccionados');

    boton(fixture, 'Asignar área').click();
    await fixture.whenStable();

    const dialogo = host(fixture).querySelector('dialog');
    expect(dialogo?.hasAttribute('open')).toBe(true);
    expect(dialogo?.textContent).toContain('Asignar área a 2 puestos');
    expect(dialogo?.textContent).toContain('Coordinador');

    const area = dialogo?.querySelector<HTMLSelectElement>('#asignar-area');
    expect(area).not.toBeNull();
    area!.value = '4';
    area!.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const confirmar = Array.from(dialogo?.querySelectorAll('button') ?? []).find(
      (elemento) => (elemento.textContent ?? '').trim() === 'Asignar',
    );
    expect(confirmar).toBeDefined();
    confirmar!.click();
    await fixture.whenStable();

    const asignacion = peticion('/puestos/asignar-area');
    expect(asignacion.request.method).toBe('POST');
    expect(asignacion.request.body).toEqual({ puesto_ids: [7, 8], area_id: 4 });

    // The answer is not wrapped in `data`: it counts and carries the new rows.
    asignacion.flush({
      creados: 2,
      puestos: [
        { ...ANALISTA, areas: [SISTEMAS_PUESTO, RECURSOS_PUESTO] },
        { ...COORDINADOR, areas: [RECURSOS_PUESTO] },
      ],
    });
    await fixture.whenStable();

    // The selection is spent, so its bar leaves with it.
    expect(texto(fixture)).not.toContain('2 seleccionados');
    // The rows come from the answer, so only the counters are asked again.
    peticion('/diagnostico').flush(DIAGNOSTICO);
    await fixture.whenStable();

    expect(areasEnFila(fixture, 'Analista')).toEqual([
      'Depto. Sistemas',
      'Depto. Recursos Humanos',
    ]);

    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toBe('Se crearon 2 asociaciones nuevas.');
  });

  it('says so when the assignment created nothing new', async () => {
    const fixture = await render();

    control<HTMLInputElement>(fixture, 'Seleccionar Analista').dispatchEvent(new Event('change'));
    await fixture.whenStable();

    boton(fixture, 'Asignar área').click();
    await fixture.whenStable();

    const area = host(fixture).querySelector<HTMLSelectElement>('#asignar-area');
    area!.value = '3';
    area!.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const confirmar = Array.from(
      host(fixture).querySelectorAll<HTMLButtonElement>('dialog button'),
    ).find((elemento) => (elemento.textContent ?? '').trim() === 'Asignar');
    confirmar!.click();
    await fixture.whenStable();

    // The call is idempotent: nothing existed to create, and that is not a failure.
    peticion('/puestos/asignar-area').flush({ creados: 0, puestos: [] });
    await fixture.whenStable();

    peticion('/diagnostico').flush(DIAGNOSTICO);
    await fixture.whenStable();

    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts.length).toBe(1);
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].message).toBe(
      'No se creó ninguna asociación: los puestos ya estaban en esa área.',
    );
  });

  it('shows the categories and the chart as read-only tables', async () => {
    const fixture = await render();

    boton(fixture, 'Categorías').click();
    await fixture.whenStable();

    const categorias = host(fixture).querySelector('#panel-categorias');
    expect(categorias).not.toBeNull();
    // No editors left: the catalog cannot be changed from this screen.
    expect(categorias!.querySelectorAll('select, input, textarea').length).toBe(0);
    expect(
      Array.from(categorias!.querySelectorAll('tbody tr')).map((fila) =>
        Array.from(fila.querySelectorAll('td')).map((celda) => (celda.textContent ?? '').trim()),
      ),
    ).toEqual([
      ['ADMIN', 'administrativo', 'Personal administrativo', 'Sí'],
      ['MANDO', 'mando_medio', 'Mando medio', 'Sí'],
      // A deactivated category is still listed: it exists, it is not offered.
      ['DIR', 'directivo', 'Directivo', 'No'],
    ]);

    boton(fixture, 'Áreas').click();
    await fixture.whenStable();

    const areas = host(fixture).querySelector('#panel-areas');
    expect(areas).not.toBeNull();
    expect(areas!.querySelectorAll('select, input, textarea').length).toBe(0);
    expect(
      Array.from(areas!.querySelectorAll('tbody tr')).map((fila) =>
        Array.from(fila.querySelectorAll('td')).map((celda) => (celda.textContent ?? '').trim()),
      ),
    ).toEqual([
      ['Rectoría', 'No', 'Sí'],
      ['Depto. Recursos Humanos', 'Sí', 'Sí'],
      ['Depto. Sistemas', 'Sí', 'Sí'],
    ]);
  });

  it('renders the contradicted classification on its own line', async () => {
    const fixture = await render();

    const lineas = Array.from(host(fixture).querySelectorAll('.finding-item')).map(
      (linea) => linea.textContent?.trim() ?? '',
    );

    const contra = lineas.find((linea) => linea.includes('Coordinador'));
    expect(contra).toContain('mando_medio');
    expect(contra).toContain('2 en contra');
  });

  it('explains a permission failure and offers no retry', async () => {
    const fixture = TestBed.createComponent(CatalogosPage);
    await fixture.whenStable();

    peticion('/puestos').flush(
      { mensaje: 'No autorizado.', codigo: 'permiso_denegado' },
      { status: 403, statusText: 'Forbidden' },
    );
    peticion('/categorias').flush({ data: [] });
    peticion('/areas').flush({ data: [] });
    peticion('/diagnostico').flush(DIAGNOSTICO);
    await fixture.whenStable();

    expect(texto(fixture)).toContain('No tenés permiso para administrar los catálogos.');
    expect(texto(fixture)).toContain('permiso_denegado');
    // Nothing to administer, so the tabs leave with the alert; and asking again
    // would answer the same.
    expect(host(fixture).querySelector('[role="tablist"]')).toBeNull();
    expect(buscarBoton(fixture, 'Reintentar')).toBeUndefined();
  });
});
