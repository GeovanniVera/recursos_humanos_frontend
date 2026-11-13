import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { EmpleadoRegistrado, FormularioCatalogos } from '../../../core/empleados/alta.models';
import { calcularDigitoVerificador, LARGO_MAXIMO_LOCAL } from '../../../core/empleados/validacion';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { AltaPage } from './alta-page.component';

const URL_EMPLEADOS = `${environment.apiBaseUrl}/empleados`;
const URL_FORMULARIO = `${URL_EMPLEADOS}/formulario`;

/** Assignable area of the fixture chart: the department sits at depth 2. */
const AREA_ASIGNABLE = 3;

/** Second assignable area, with no posts of its own yet. */
const AREA_SIN_PUESTOS = 5;

/** Regular post and the category it points at. */
const PUESTO_ADMIN = 7;
const CATEGORIA_ADMIN = 3;

/** `mando_medio_superior` post and the category it points at. */
const PUESTO_MANDO = 9;
const CATEGORIA_MANDO = 4;

/** Post of another area, and one the pivot leaves without any area. */
const PUESTO_OTRA_AREA = 11;
const PUESTO_SIN_AREA = 12;

/** The example the RENAPO publishes: Veracruz, 1956-04-27, female. */
const CURP_VALIDA = 'HEGG560427MVZRRL04';

/** The same CURP with a check digit that does not belong to it. */
const CURP_DIGITO_MALO = 'HEGG560427MVZRRL05';

/** The same CURP with the last character missing. */
const CURP_INCOMPLETA = 'HEGG560427MVZRRL0';

/**
 * A well formed CURP of Jalisco (`JC` at characters 12 and 13), an entity the
 * fixture catalogue does not carry and the frozen RENAPO table does. The check
 * digit is computed instead of written, so the value stays valid if the base
 * ever changes.
 */
const CURP_ENTIDAD_FUERA = (() => {
  const base = 'HEGG560427MJCRRL0';
  return `${base}${calcularDigitoVerificador(base)}`;
})();

/** `200` body of the catalog endpoint, straight from the contract. */
const CATALOGOS: FormularioCatalogos = {
  areas: [
    {
      id: 1,
      padre_id: null,
      nombre: 'Rectoría',
      tipo_area: 'Dirección',
      naturaleza: 'Sustantiva',
      orden: 1,
      asignable: false,
    },
    {
      id: 2,
      padre_id: 1,
      nombre: 'Secretaría Académica',
      tipo_area: 'Dirección',
      naturaleza: 'Sustantiva',
      orden: 1,
      asignable: false,
    },
    {
      id: 3,
      padre_id: 2,
      nombre: 'Departamento de Sistemas',
      tipo_area: 'Operativa',
      naturaleza: 'Adjetiva',
      orden: 1,
      asignable: true,
    },
    // Second root, with the same `orden` as the first: the real payload has 17
    // roots and ties at 0, so the order of the array cannot be trusted.
    {
      id: 4,
      padre_id: null,
      nombre: 'Consejo Directivo',
      tipo_area: 'Gobierno',
      naturaleza: 'Sustantiva',
      orden: 0,
      asignable: false,
    },
    // Assignable area without posts: the catalogue gap the empty state reports.
    {
      id: AREA_SIN_PUESTOS,
      padre_id: null,
      nombre: 'Dirección de Recursos Humanos',
      tipo_area: 'Dirección',
      naturaleza: 'Sustantiva',
      orden: 2,
      asignable: true,
    },
  ],
  puestos: [
    {
      id: PUESTO_ADMIN,
      nombre: 'Analista',
      categoria_cct_id: CATEGORIA_ADMIN,
      area_ids: [AREA_ASIGNABLE],
    },
    {
      id: PUESTO_MANDO,
      nombre: 'Director de área',
      categoria_cct_id: CATEGORIA_MANDO,
      area_ids: [AREA_ASIGNABLE],
    },
    // Post of another area: it must not appear once an area is chosen.
    { id: PUESTO_OTRA_AREA, nombre: 'Abogado', categoria_cct_id: CATEGORIA_ADMIN, area_ids: [2] },
    // Empty pivot: the server accepts it nowhere, so no area offers it.
    { id: PUESTO_SIN_AREA, nombre: 'Técnico', categoria_cct_id: CATEGORIA_ADMIN, area_ids: [] },
  ],
  categorias_cct: [
    { id: CATEGORIA_ADMIN, clave: 'CCT-01', tipo: 'administrativo', descripcion: 'Analista' },
    {
      id: CATEGORIA_MANDO,
      clave: 'CCT-02',
      tipo: 'mando_medio_superior',
      descripcion: 'Dirección',
    },
    { id: 5, clave: 'CCT-09', tipo: 'operativo', descripcion: 'Intendencia' },
  ],
  niveles_estudios: [{ id: 2, clave: 'LIC', descripcion: 'Licenciatura' }],
  estados_civiles: [{ id: 1, clave: 'SOL', descripcion: 'Soltero' }],
  tipos_personal: ['No Aplica', 'Sindicalizado', 'No sindicalizado'],
  sexos: ['Masculino', 'Femenino'],
  // Veracruz, the entity the RENAPO example CURP of this fixture carries.
  entidades: [
    { clave: 'VZ', nombre: 'Veracruz' },
    { clave: 'DF', nombre: 'Ciudad de México' },
    { clave: 'MC', nombre: 'Estado de México' },
  ],
  tipos_jornada: ['Matutina', 'Vespertina', 'Mixta'],
  trabaja_otro_lugar: ['No', 'Publico', 'Privado'],
};

/**
 * The same catalogue as the live service sends it today: without `entidades`.
 *
 * The field of the entity of birth used to work only against a fixture that
 * invented this list, so the real screen stayed blank. The payload here is
 * spelled out instead of spread so the missing key is visible in the file.
 */
const CATALOGOS_SIN_ENTIDADES: FormularioCatalogos = {
  areas: CATALOGOS.areas,
  puestos: CATALOGOS.puestos,
  categorias_cct: CATALOGOS.categorias_cct,
  niveles_estudios: CATALOGOS.niveles_estudios,
  estados_civiles: CATALOGOS.estados_civiles,
  tipos_personal: CATALOGOS.tipos_personal,
  sexos: CATALOGOS.sexos,
  tipos_jornada: CATALOGOS.tipos_jornada,
  trabaja_otro_lugar: CATALOGOS.trabaja_otro_lugar,
};

/** Plaza of a regular post: it needs the personal type and the shift. */
interface Plaza {
  puesto: number;
  personal?: string;
  jornada?: string;
}

const PLAZA_ADMIN: Plaza = {
  puesto: PUESTO_ADMIN,
  personal: 'Sindicalizado',
  jornada: 'Matutina',
};

/** A mando medio post: the server fixes both values, so there is nothing to choose. */
const PLAZA_MANDO: Plaza = { puesto: PUESTO_MANDO };

/** The same catalogue, with the regular post pointing at a missing category. */
const CATALOGOS_SIN_CATEGORIA: FormularioCatalogos = {
  ...CATALOGOS,
  puestos: CATALOGOS.puestos.map((puesto) =>
    puesto.id === PUESTO_ADMIN ? { ...puesto, categoria_cct_id: 999 } : puesto,
  ),
};

const CREADO: EmpleadoRegistrado = {
  id: 42,
  num_empleado: '12345',
  nombre: 'Ana Martínez',
  correo_institucional: 'ana@utn.edu.mx',
  activo: true,
};

function host(fixture: ComponentFixture<AltaPage>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function texto(fixture: ComponentFixture<AltaPage>): string {
  return host(fixture).textContent ?? '';
}

/**
 * Label of an `<option>`.
 *
 * The newlines and the indentation of the template are not part of the label;
 * the non-breaking spaces of the chart are.
 */
function textoDeOpcion(opcion: HTMLOptionElement): string {
  return (opcion.textContent ?? '').replace(/^[\n\r\t ]+/, '').replace(/[\n\r\t ]+$/, '');
}

function elemento<T extends HTMLElement>(
  fixture: ComponentFixture<AltaPage>,
  selector: string,
): T | null {
  return host(fixture).querySelector<T>(selector);
}

/** Native `<button>` of an `app-button`, found by the label it projects. */
function boton(fixture: ComponentFixture<AltaPage>, etiqueta: string): HTMLButtonElement {
  const encontrado = Array.from(
    host(fixture).querySelectorAll<HTMLButtonElement>('button'),
  ).find((candidato) => (candidato.textContent ?? '').includes(etiqueta));

  if (encontrado === undefined) {
    throw new Error(`No button labelled ${etiqueta}`);
  }
  return encontrado;
}

/** Types into a text, number or date field the way a keyboard does. */
async function escribir(
  fixture: ComponentFixture<AltaPage>,
  id: string,
  valor: string,
): Promise<void> {
  const campo = elemento<HTMLInputElement | HTMLTextAreaElement>(fixture, `#${id}`);
  if (campo === null) {
    throw new Error(`No field #${id} rendered`);
  }
  campo.value = valor;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
}

/** Chooses an option of a `<select>` by the value the contract carries. */
async function elegir(
  fixture: ComponentFixture<AltaPage>,
  id: string,
  valor: string | number,
): Promise<void> {
  const selector = elemento<HTMLSelectElement>(fixture, `#${id}`);
  if (selector === null) {
    throw new Error(`No select #${id} rendered`);
  }
  selector.value = String(valor);
  selector.dispatchEvent(new Event('change', { bubbles: true }));
  await fixture.whenStable();
}

/** Leaves a control the way the tab key does, which is when it is validated. */
async function desenfocar(fixture: ComponentFixture<AltaPage>, id: string): Promise<void> {
  const campo = elemento<HTMLElement>(fixture, `#${id}`);
  if (campo === null) {
    throw new Error(`No field #${id} rendered`);
  }
  campo.dispatchEvent(new Event('blur', { bubbles: true }));
  await fixture.whenStable();
}

/** Text of the read-only category field, trimmed. */
function categoriaDerivada(fixture: ComponentFixture<AltaPage>): string {
  return (elemento<HTMLElement>(fixture, '#categoria-cct')?.textContent ?? '').trim();
}

/** Note that a field prints under its control, trimmed. */
function notaDe(fixture: ComponentFixture<AltaPage>, id: string): string {
  const control = elemento<HTMLElement>(fixture, `#${id}`);
  const nota = control?.parentElement?.querySelector('[role="status"]');
  return (nota?.textContent ?? '').trim();
}

/** Clicks a button of the wizard and lets the render settle. */
async function pulsar(fixture: ComponentFixture<AltaPage>, etiqueta: string): Promise<void> {
  boton(fixture, etiqueta).click();
  await fixture.whenStable();
}

describe('AltaPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AltaPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  /** Creates the screen and answers the single catalog request. */
  async function abrirFormulario(
    catalogos: FormularioCatalogos = CATALOGOS,
  ): Promise<ComponentFixture<AltaPage>> {
    const fixture = TestBed.createComponent(AltaPage);
    await fixture.whenStable();

    httpMock.expectOne((peticion) => peticion.url === URL_FORMULARIO).flush(catalogos);
    await fixture.whenStable();

    return fixture;
  }

  /** Fills the three required fields of step 1 and moves to `Plaza`. */
  async function irAPlaza(fixture: ComponentFixture<AltaPage>): Promise<void> {
    await escribir(fixture, 'num_empleado', '12345');
    await escribir(fixture, 'nombre', 'Ana Martínez');
    await escribir(fixture, 'correo_institucional', 'ana@utn.edu.mx');
    await pulsar(fixture, 'Continuar');
  }

  /** Completes `Plaza` with one post and moves on. */
  async function llenarPlaza(fixture: ComponentFixture<AltaPage>, plaza: Plaza): Promise<void> {
    await elegir(fixture, 'area_id', AREA_ASIGNABLE);
    await elegir(fixture, 'puesto_id', plaza.puesto);
    await escribir(fixture, 'fecha_inicio_puesto', '2026-01-15');

    if (plaza.personal !== undefined) {
      await elegir(fixture, 'tipo_personal', plaza.personal);
    }
    if (plaza.jornada !== undefined) {
      await elegir(fixture, 'tipo_jornada', plaza.jornada);
    }
  }

  /** Walks the whole wizard up to the summary. */
  async function irAConfirmacion(
    fixture: ComponentFixture<AltaPage>,
    plaza: Plaza = PLAZA_ADMIN,
  ): Promise<void> {
    await irAPlaza(fixture);
    await llenarPlaza(fixture, plaza);
    await pulsar(fixture, 'Continuar');
    await pulsar(fixture, 'Continuar');
  }

  /** Submits the summary and returns the request in flight. */
  async function enviar(fixture: ComponentFixture<AltaPage>): Promise<TestRequest> {
    await pulsar(fixture, 'Registrar empleado');
    const [peticion] = httpMock.match((candidate) => candidate.url === URL_EMPLEADOS);
    expect(peticion).toBeDefined();
    return peticion;
  }

  it('loads the catalogs and renders step 1 with the four stops of the stepper', async () => {
    const fixture = await abrirFormulario();

    // The stepper names every step and marks the one on screen.
    const stops = Array.from(host(fixture).querySelectorAll('.stepper .stop'));
    expect(stops.length).toBe(4);
    expect(
      Array.from(host(fixture).querySelectorAll('.stepper .stop-label')).map((stop) =>
        (stop.textContent ?? '').trim(),
      ),
    ).toEqual(['Identificación', 'Plaza', 'Estudios y experiencia', 'Confirmación']);
    expect(
      Array.from(host(fixture).querySelectorAll('.stepper .stop-mark')).map((marca) =>
        (marca.textContent ?? '').trim(),
      ),
    ).toEqual(['1', '2', '3', '4']);
    expect(stops[0].getAttribute('aria-current')).toBe('step');
    expect(stops[1].getAttribute('aria-current')).toBeNull();

    // The card holds the identity fields of step 1, and only those.
    expect(elemento(fixture, '#num_empleado')).not.toBeNull();
    expect(elemento(fixture, '#nombre')).not.toBeNull();
    expect(elemento(fixture, '#correo_institucional')).not.toBeNull();
    expect(elemento(fixture, '#area_id')).toBeNull();
    expect(host(fixture).querySelector('[role="alert"]')).toBeNull();
  });

  it('flattens the forest of areas by name within each level, with several roots', async () => {
    const fixture = await abrirFormulario();
    await irAPlaza(fixture);

    const selector = elemento<HTMLSelectElement>(fixture, '#area_id');
    expect(selector).not.toBeNull();

    const areas = Array.from(selector?.options ?? []).slice(1);
    // The endpoint sends a forest, not a tree, and `orden` ties: the traversal
    // sorts siblings by name so the list does not move between calls.
    expect(areas.map(textoDeOpcion)).toEqual([
      'Consejo Directivo',
      'Dirección de Recursos Humanos',
      'Rectoría',
      '\u00A0\u00A0Secretaría Académica',
      '\u00A0\u00A0\u00A0\u00A0Departamento de Sistemas',
    ]);
    // Only the department and the HR directorate can hold an employee.
    expect(areas.map((area) => area.disabled)).toEqual([true, false, true, true, false]);
  });

  it('cannot leave step 1 without the number, the name and the email', async () => {
    const fixture = await abrirFormulario();

    expect(boton(fixture, 'Continuar').disabled).toBe(true);

    await escribir(fixture, 'num_empleado', '12345');
    await escribir(fixture, 'nombre', 'Ana Martínez');
    expect(boton(fixture, 'Continuar').disabled).toBe(true);

    // A click on a disabled button must not skip a step.
    await pulsar(fixture, 'Continuar');
    expect(elemento(fixture, '#area_id')).toBeNull();

    await escribir(fixture, 'correo_institucional', 'ana@utn.edu.mx');
    expect(boton(fixture, 'Continuar').disabled).toBe(false);

    await pulsar(fixture, 'Continuar');
    expect(elemento(fixture, '#area_id')).not.toBeNull();
    expect(elemento(fixture, '#num_empleado')).toBeNull();

    // The stop left behind is marked as answered, and the new one is current.
    const marcas = Array.from(host(fixture).querySelectorAll('.stepper .stop-mark')).map((marca) =>
      (marca.textContent ?? '').trim(),
    );
    expect(marcas).toEqual(['✓', '2', '3', '4']);
    const stops = Array.from(host(fixture).querySelectorAll('.stepper .stop'));
    expect(stops[1].getAttribute('aria-current')).toBe('step');
    expect(stops[0].getAttribute('aria-current')).toBeNull();
  });

  it('labels each post with the areas it belongs to', async () => {
    const fixture = await abrirFormulario();
    await irAPlaza(fixture);
    await elegir(fixture, 'area_id', AREA_ASIGNABLE);

    const etiquetas = (): string[] =>
      Array.from(elemento<HTMLSelectElement>(fixture, '#puesto_id')?.options ?? [])
        .slice(1)
        .map(textoDeOpcion);

    // 36 posts can share a name: without the area the operator chooses blind.
    expect(etiquetas()).toEqual([
      'Analista · Departamento de Sistemas',
      'Director de área · Departamento de Sistemas',
    ]);

    // A post of the `area_puesto` pivot belongs to every area of its list, and
    // one with an empty list says so instead of pretending to belong somewhere.
    expect(
      fixture.componentInstance.etiquetaPuesto({
        id: 99,
        nombre: 'Coordinador',
        categoria_cct_id: CATEGORIA_ADMIN,
        area_ids: [AREA_ASIGNABLE, AREA_SIN_PUESTOS],
      }),
    ).toBe('Coordinador · Departamento de Sistemas, Dirección de Recursos Humanos');
    expect(
      fixture.componentInstance.etiquetaPuesto({
        id: 100,
        nombre: 'Técnico',
        categoria_cct_id: CATEGORIA_ADMIN,
        area_ids: [],
      }),
    ).toBe('Técnico · sin área asignada');
  });

  it('fills the entity of birth from the CURP and labels it with the catalogue name', async () => {
    const fixture = await abrirFormulario();

    const campo = elemento<HTMLInputElement>(fixture, '#entidad_nacimiento');
    expect(campo?.value).toBe('');
    // Read only, not disabled: the field informs, so it stays reachable by
    // keyboard and by a screen reader.
    expect(campo?.readOnly).toBe(true);
    expect(campo?.disabled).toBe(false);
    expect(campo?.getAttribute('aria-describedby')).toBe('derivado-entidad_nacimiento');
    expect(texto(fixture)).toContain('Se toma de los caracteres 12 y 13 de la CURP.');

    await escribir(fixture, 'curp', CURP_VALIDA);

    // Characters 12 and 13 of the RENAPO example are `VZ`, and the name is the
    // one the catalogue sends, which overrides the local one of that key.
    expect(elemento<HTMLInputElement>(fixture, '#entidad_nacimiento')?.value).toBe('Veracruz');
  });

  it('names the entity from the local RENAPO table when the payload has no entidades', async () => {
    // The regression that reached production: the live endpoint does not send
    // `entidades` yet, so every lookup missed and the field stayed blank.
    const fixture = await abrirFormulario(CATALOGOS_SIN_ENTIDADES);

    await escribir(fixture, 'curp', CURP_VALIDA);

    expect(elemento<HTMLInputElement>(fixture, '#entidad_nacimiento')?.value).toBe('Veracruz');
  });

  it('clears the entity when the CURP is deleted', async () => {
    const fixture = await abrirFormulario();

    await escribir(fixture, 'curp', CURP_VALIDA);
    expect(elemento<HTMLInputElement>(fixture, '#entidad_nacimiento')?.value).toBe('Veracruz');

    // A value that outlives the CURP it came from would travel as if it were true.
    await escribir(fixture, 'curp', '');
    expect(elemento<HTMLInputElement>(fixture, '#entidad_nacimiento')?.value).toBe('');
  });

  it('names a key the payload omits and blanks one RENAPO does not issue', async () => {
    const fixture = await abrirFormulario();

    // A well formed CURP of Jalisco: the fixture catalogue does not offer `JC`,
    // and a partial or late payload must not blank a key of the national standard.
    await escribir(fixture, 'curp', CURP_ENTIDAD_FUERA);
    expect(elemento<HTMLInputElement>(fixture, '#entidad_nacimiento')?.value).toBe('Jalisco');

    // `XX` is not a key RENAPO issues, so there is no name to show and nothing
    // to send: the field goes back to empty.
    const sinEntidad = `${CURP_ENTIDAD_FUERA.slice(0, 11)}XX${CURP_ENTIDAD_FUERA.slice(13)}`;
    await escribir(fixture, 'curp', sinEntidad);
    expect(elemento<HTMLInputElement>(fixture, '#entidad_nacimiento')?.value).toBe('');
  });

  it('sends the two characters of the CURP as the entity of birth', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = await abrirFormulario();
    await escribir(fixture, 'curp', CURP_VALIDA);
    await irAConfirmacion(fixture);

    // The summary reads the name; the body carries the key.
    expect(texto(fixture)).toContain('Veracruz');

    const peticion = await enviar(fixture);
    expect(peticion.request.body.entidad_nacimiento).toBe('VZ');
    peticion.flush(CREADO, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
  });

  it('lists only the posts of the chosen area, never the ones assigned elsewhere', async () => {
    const fixture = await abrirFormulario();
    await irAPlaza(fixture);

    const valores = (): string[] =>
      Array.from(elemento<HTMLSelectElement>(fixture, '#puesto_id')?.options ?? []).map(
        (option) => option.value,
      );

    // Without an area there is no pair for the server to accept, so there is
    // nothing to offer: the list is the placeholder and nothing else.
    expect(valores()).toEqual(['']);

    await elegir(fixture, 'area_id', AREA_ASIGNABLE);

    expect(valores()).toEqual(['', String(PUESTO_ADMIN), String(PUESTO_MANDO)]);
    // A post of another area is absent, and so is one whose pivot is empty: the
    // server accepts that one nowhere.
    expect(valores()).not.toContain(String(PUESTO_OTRA_AREA));
    expect(valores()).not.toContain(String(PUESTO_SIN_AREA));
  });

  it('shows the category derived from the post and offers no category control', async () => {
    const fixture = await abrirFormulario();
    await irAPlaza(fixture);

    // There is no control to choose: the server derives the category from the
    // post and prohibits receiving one.
    expect(host(fixture).querySelector('select#categoria_cct_id')).toBeNull();
    expect(texto(fixture)).toContain('Se asigna al elegir el puesto.');

    await elegir(fixture, 'area_id', AREA_ASIGNABLE);
    await elegir(fixture, 'puesto_id', PUESTO_ADMIN);
    expect(categoriaDerivada(fixture)).toBe('CCT-01 · Analista');

    // Another post, another category: the value follows `categoria_cct_id`.
    await elegir(fixture, 'puesto_id', PUESTO_MANDO);
    expect(categoriaDerivada(fixture)).toBe('CCT-02 · Dirección');
  });

  it('clears the post when the area changes, and says where new posts are assigned', async () => {
    const fixture = await abrirFormulario();
    await irAPlaza(fixture);

    await elegir(fixture, 'area_id', AREA_ASIGNABLE);
    await elegir(fixture, 'puesto_id', PUESTO_ADMIN);
    expect(elemento<HTMLSelectElement>(fixture, '#puesto_id')?.value).toBe(String(PUESTO_ADMIN));

    // The second area has no posts at all, so the choice of the first one cannot
    // travel with it: the server would answer `422`.
    await elegir(fixture, 'area_id', AREA_SIN_PUESTOS);

    expect(elemento<HTMLSelectElement>(fixture, '#puesto_id')?.value).toBe('');
    // The category was derived from that post, so it leaves with it.
    expect(categoriaDerivada(fixture)).toBe('Se asigna al elegir el puesto.');

    const aviso = notaDe(fixture, 'puesto_id');
    expect(aviso).toContain('No hay puestos asociados a esta área.');
    expect(aviso).toContain('Asignalos desde Catálogos.');
  });

  it('blocks the plaza when the chosen post has no category in the catalogue', async () => {
    const fixture = await abrirFormulario(CATALOGOS_SIN_CATEGORIA);
    await irAPlaza(fixture);

    await elegir(fixture, 'area_id', AREA_ASIGNABLE);
    await elegir(fixture, 'puesto_id', PUESTO_ADMIN);
    await escribir(fixture, 'fecha_inicio_puesto', '2026-01-15');

    // There is no control to fix, so the message sits under the post and the
    // step refuses to move: the server would derive no category from it.
    expect(boton(fixture, 'Continuar').disabled).toBe(true);
    expect(categoriaDerivada(fixture)).toBe('Sin categoría asignada.');

    await desenfocar(fixture, 'puesto_id');
    expect(elemento<HTMLElement>(fixture, '#error-puesto_id')?.textContent).toContain(
      'El puesto elegido no tiene categoría asignada.',
    );
  });

  it('offers only Sindicalizado and No sindicalizado when the category is not a mando medio', async () => {
    const fixture = await abrirFormulario();
    await irAPlaza(fixture);

    await elegir(fixture, 'area_id', AREA_ASIGNABLE);
    await elegir(fixture, 'puesto_id', PUESTO_ADMIN);

    const opciones = Array.from(
      elemento<HTMLSelectElement>(fixture, '#tipo_personal')?.options ?? [],
    ).map((option) => option.value);

    // The catalogue carries `No Aplica`, but that value belongs to a mando medio
    // and the server rejects it everywhere else. It is never offered as a choice.
    expect(opciones).toEqual(['', 'Sindicalizado', 'No sindicalizado']);
  });

  it('hides the personal type and the shift for a mando medio post and sends the fixed values', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = await abrirFormulario();
    await irAPlaza(fixture);

    // A regular post does ask for both.
    await elegir(fixture, 'area_id', AREA_ASIGNABLE);
    await elegir(fixture, 'puesto_id', PUESTO_ADMIN);
    expect(elemento(fixture, '#tipo_personal')).not.toBeNull();
    expect(elemento(fixture, '#tipo_jornada')).not.toBeNull();

    // A `mando_medio_superior` category has neither.
    await llenarPlaza(fixture, PLAZA_MANDO);
    expect(elemento(fixture, '#tipo_personal')).toBeNull();
    expect(elemento(fixture, '#tipo_jornada')).toBeNull();
    expect(texto(fixture)).toContain('Puesto de mando medio');

    // The gate does not ask for the two hidden fields, so the step still moves.
    await pulsar(fixture, 'Continuar');
    await pulsar(fixture, 'Continuar');

    const peticion = await enviar(fixture);
    expect(peticion.request.body.tipo_personal).toBe('No Aplica');
    expect(peticion.request.body.tipo_jornada).toBe('Mixta');

    peticion.flush(CREADO, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
  });

  it('asks where the worker also works only when the answer is not No, and never sends it with No', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = await abrirFormulario();
    await irAPlaza(fixture);
    await llenarPlaza(fixture, PLAZA_ADMIN);
    await pulsar(fixture, 'Continuar');

    expect(elemento(fixture, '#trabaja_otro_donde')).toBeNull();

    await elegir(fixture, 'trabaja_otro_lugar', 'Publico');
    expect(elemento(fixture, '#trabaja_otro_donde')).not.toBeNull();
    await escribir(fixture, 'trabaja_otro_donde', 'Gobierno del Estado de México');

    await pulsar(fixture, 'Continuar');
    const conDetalle = await enviar(fixture);
    expect(conDetalle.request.body.trabaja_otro_donde).toBe('Gobierno del Estado de México');
    conDetalle.flush(CREADO, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    // Back to the experience step: answering `No` clears and removes the field.
    await pulsar(fixture, 'Atrás');
    await elegir(fixture, 'trabaja_otro_lugar', 'No');
    expect(elemento(fixture, '#trabaja_otro_donde')).toBeNull();

    await pulsar(fixture, 'Continuar');
    const sinDetalle = await enviar(fixture);
    // Prohibited by the backend in that case: the key does not travel at all.
    expect(Object.hasOwn(sinDetalle.request.body, 'trabaja_otro_donde')).toBe(false);
    expect(sinDetalle.request.body.trabaja_otro_lugar).toBe('No');
    sinDetalle.flush(CREADO, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
  });

  it('shows the 422 message next to the field and moves to the step that holds it', async () => {
    const fixture = await abrirFormulario();
    await irAConfirmacion(fixture);

    const peticion = await enviar(fixture);
    expect(peticion.request.body).toMatchObject({
      num_empleado: '12345',
      nombre: 'Ana Martínez',
      correo_institucional: 'ana@utn.edu.mx',
      area_id: AREA_ASIGNABLE,
      puesto_id: PUESTO_ADMIN,
      fecha_inicio_puesto: '2026-01-15',
    });

    peticion.flush(
      {
        message: 'Los datos no son válidos.',
        errors: {
          correo_institucional: ['El correo debe pertenecer al dominio institucional.'],
        },
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();

    // The wizard jumps back to the card that holds the field.
    expect(elemento(fixture, '#correo_institucional')).not.toBeNull();
    expect(elemento(fixture, '#area_id')).toBeNull();

    const aviso = elemento<HTMLElement>(fixture, '#error-correo_institucional');
    expect(aviso?.getAttribute('role')).toBe('alert');
    expect(aviso?.textContent).toContain('El correo debe pertenecer al dominio institucional.');

    const campo = elemento<HTMLInputElement>(fixture, '#correo_institucional');
    expect(campo?.getAttribute('aria-describedby')).toBe('error-correo_institucional');
    // Nothing typed is lost: the draft survives the failure and still holds the
    // complete address, while the control shows the local part it asks for.
    expect(campo?.value).toBe('ana');
    expect(fixture.componentInstance.modelo().correo_institucional).toBe('ana@utn.edu.mx');
    expect(texto(fixture)).toContain('Los datos no son válidos.');
  });

  it('keeps every choice when a later failure sends the user back to a card', async () => {
    const fixture = await abrirFormulario();
    await irAConfirmacion(fixture);

    const peticion = await enviar(fixture);
    peticion.flush(
      {
        message: 'Los datos no son válidos.',
        errors: { tipo_personal: ['El tipo de personal no es válido.'] },
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();

    // The card of the plaza is back, with every choice still made: the draft is
    // never reset by a failure, and a re-created `<select>` is re-painted from
    // the model instead of falling back to its placeholder.
    expect(elemento<HTMLSelectElement>(fixture, '#area_id')?.value).toBe(String(AREA_ASIGNABLE));
    expect(elemento<HTMLSelectElement>(fixture, '#puesto_id')?.value).toBe(String(PUESTO_ADMIN));
    // The category is not stored in the draft: it is read from the post again.
    expect(categoriaDerivada(fixture)).toBe('CCT-01 · Analista');
    expect(elemento<HTMLSelectElement>(fixture, '#tipo_personal')?.value).toBe('Sindicalizado');
    expect(elemento<HTMLSelectElement>(fixture, '#tipo_jornada')?.value).toBe('Matutina');
    expect(elemento<HTMLInputElement>(fixture, '#fecha_inicio_puesto')?.value).toBe('2026-01-15');
  });

  it('never sends a categoria_cct_id: the server derives it from the post', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = await abrirFormulario();
    await irAConfirmacion(fixture);

    const peticion = await enviar(fixture);
    // Prohibited by the backend: the key does not travel at all, not even as an
    // empty value, because the category belongs to the post it sent.
    expect(Object.hasOwn(peticion.request.body, 'categoria_cct_id')).toBe(false);
    expect(peticion.request.body.puesto_id).toBe(PUESTO_ADMIN);

    peticion.flush(CREADO, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
  });

  it('toasts the created number and returns to the active roster on success', async () => {
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toast = TestBed.inject(ToastService);

    const fixture = await abrirFormulario();
    await irAConfirmacion(fixture);

    // The summary recaps what was typed, grouped by step.
    expect(texto(fixture)).toContain('Departamento de Sistemas');
    expect(texto(fixture)).toContain('CCT-01');

    const peticion = await enviar(fixture);
    peticion.flush(CREADO, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    const avisos = toast.toasts();
    expect(avisos.length).toBe(1);
    expect(avisos[0].type).toBe('success');
    expect(avisos[0].title).toBe('Empleado registrado.');
    expect(avisos[0].message).toContain('12345');
    expect(navegar).toHaveBeenCalledWith(['/empleados/activos']);
  });

  it('waits for the 18th character before saying anything about the CURP', async () => {
    const fixture = await abrirFormulario();

    // Seventeen characters are a CURP on its way, not a mistake.
    await escribir(fixture, 'curp', CURP_INCOMPLETA);
    expect(elemento(fixture, '#error-curp')).toBeNull();

    await escribir(fixture, 'curp', CURP_DIGITO_MALO);
    const aviso = elemento<HTMLElement>(fixture, '#error-curp');

    // One sentence, the one the backend collapses all of its rules into.
    expect(aviso?.textContent).toContain(
      'La CURP no es válida. Revisa el formato, la entidad y el dígito verificador.',
    );
    // The specific motivo travels in the `title`, never as a second sentence.
    expect(aviso?.getAttribute('title')).toBe(
      'El dígito verificador no coincide con el resto de la CURP.',
    );

    const campo = elemento<HTMLInputElement>(fixture, '#curp');
    expect(campo?.getAttribute('aria-invalid')).toBe('true');
    expect(campo?.getAttribute('aria-describedby')).toBe('error-curp');
  });

  it('reports an incomplete CURP once the control loses focus', async () => {
    const fixture = await abrirFormulario();

    await escribir(fixture, 'curp', CURP_INCOMPLETA);
    await desenfocar(fixture, 'curp');

    expect(elemento<HTMLElement>(fixture, '#error-curp')?.textContent).toContain(
      'La CURP no es válida.',
    );
  });

  it('clears the CURP error as soon as the value is fixed, without leaving the field', async () => {
    const fixture = await abrirFormulario();

    await escribir(fixture, 'curp', CURP_DIGITO_MALO);
    expect(elemento(fixture, '#error-curp')).not.toBeNull();

    // The user is still typing in the same control: no blur, no round trip.
    await escribir(fixture, 'curp', CURP_VALIDA);
    expect(elemento(fixture, '#error-curp')).toBeNull();
    expect(elemento<HTMLInputElement>(fixture, '#curp')?.getAttribute('aria-invalid')).toBeNull();
  });

  it('reads the birth date and the sex from a valid CURP and marks them as derived', async () => {
    const fixture = await abrirFormulario();

    await escribir(fixture, 'curp', CURP_VALIDA);

    const nacimiento = elemento<HTMLInputElement>(fixture, '#fecha_nacimiento');
    expect(nacimiento?.value).toBe('1956-04-27');
    expect(nacimiento?.disabled).toBe(true);

    const sexo = elemento<HTMLSelectElement>(fixture, '#sexo');
    expect(sexo?.value).toBe('Femenino');
    expect(sexo?.disabled).toBe(true);

    // The note under each control is what says where the value came from.
    expect(texto(fixture)).toContain('Se toma de los seis dígitos de la CURP.');
    expect(nacimiento?.getAttribute('aria-describedby')).toBe('derivado-fecha_nacimiento');

    // Clearing the CURP takes the values with it. They are locked, so a survivor
    // could never be corrected by hand, and it would still travel in the request
    // claiming to be a fact of a document that is no longer there.
    await escribir(fixture, 'curp', '');
    expect(elemento<HTMLInputElement>(fixture, '#fecha_nacimiento')?.disabled).toBe(true);
    expect(elemento<HTMLSelectElement>(fixture, '#sexo')?.disabled).toBe(true);
    expect(elemento<HTMLInputElement>(fixture, '#fecha_nacimiento')?.value).toBe('');
    expect(elemento<HTMLSelectElement>(fixture, '#sexo')?.value).toBe('');
  });

  it('locks the three derived controls with an empty CURP, before anything is typed', async () => {
    const fixture = await abrirFormulario();

    // The user only types the CURP: everything it fills is locked from the first
    // render, not once a document exists.
    const nacimiento = elemento<HTMLInputElement>(fixture, '#fecha_nacimiento');
    const sexo = elemento<HTMLSelectElement>(fixture, '#sexo');
    const entidad = elemento<HTMLInputElement>(fixture, '#entidad_nacimiento');

    // `disabled` for the two controls a native widget would let the user edit
    // anyway, `readonly` for the one that only informs.
    expect(nacimiento?.disabled).toBe(true);
    expect(sexo?.disabled).toBe(true);
    expect(entidad?.readOnly).toBe(true);
    expect(entidad?.disabled).toBe(false);

    // Every note describes the lock on an empty field, and every control points
    // at a node that exists: a dangling `aria-describedby` names nothing.
    expect(texto(fixture)).toContain('Se toma de los seis dígitos de la CURP.');
    expect(texto(fixture)).toContain('Se toma del carácter 11 de la CURP.');
    expect(texto(fixture)).toContain('Se toma de los caracteres 12 y 13 de la CURP.');
    expect(nacimiento?.getAttribute('aria-describedby')).toBe('derivado-fecha_nacimiento');
    expect(sexo?.getAttribute('aria-describedby')).toBe('derivado-sexo');
    expect(entidad?.getAttribute('aria-describedby')).toBe('derivado-entidad_nacimiento');

    // An incomplete CURP does not change the lock: it never depended on the value.
    await escribir(fixture, 'curp', CURP_INCOMPLETA);
    expect(elemento<HTMLInputElement>(fixture, '#fecha_nacimiento')?.disabled).toBe(true);
    expect(elemento<HTMLSelectElement>(fixture, '#sexo')?.disabled).toBe(true);
    expect(
      elemento<HTMLInputElement>(fixture, '#fecha_nacimiento')?.getAttribute('aria-describedby'),
    ).toBe('derivado-fecha_nacimiento');
  });

  it('does not let step 1 move on while the CURP is wrong', async () => {
    const fixture = await abrirFormulario();

    await escribir(fixture, 'num_empleado', '12345');
    await escribir(fixture, 'nombre', 'Ana Martínez');
    await escribir(fixture, 'correo_institucional', 'ana@utn.edu.mx');
    expect(boton(fixture, 'Continuar').disabled).toBe(false);

    await escribir(fixture, 'curp', CURP_DIGITO_MALO);
    expect(boton(fixture, 'Continuar').disabled).toBe(true);

    // A disabled button must not skip the step either.
    await pulsar(fixture, 'Continuar');
    expect(elemento(fixture, '#area_id')).toBeNull();

    await escribir(fixture, 'curp', CURP_VALIDA);
    expect(boton(fixture, 'Continuar').disabled).toBe(false);
  });

  it('writes the employee number in upper case as it is typed', async () => {
    const fixture = await abrirFormulario();

    await escribir(fixture, 'num_empleado', 'ab-12');

    // The control shows the value that will travel, not what was pressed.
    expect(elemento<HTMLInputElement>(fixture, '#num_empleado')?.value).toBe('AB-12');
  });

  it('asks only for the local part of the institutional address and sends the whole one', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = await abrirFormulario();

    const campo = elemento<HTMLInputElement>(fixture, '#correo_institucional');
    // A text field with the keyboard of an address, not `type="email"`: what it
    // holds is a local part, and the browser would refuse to submit that as one.
    expect(campo?.type).toBe('text');
    expect(campo?.getAttribute('inputmode')).toBe('email');
    expect(campo?.getAttribute('autocomplete')).toBe('username');
    expect(campo?.getAttribute('placeholder')).toBe('nombre.apellido');
    // The domain is on screen and announced, never typed: it is not decoration.
    expect(texto(fixture)).toContain('@utn.edu.mx');
    expect(
      elemento<HTMLElement>(fixture, '.control-suffix')?.getAttribute('aria-hidden'),
    ).toBeNull();
    // The 150 characters of the address, minus the `@` and `utn.edu.mx`.
    expect(campo?.getAttribute('maxlength')).toBe(String(LARGO_MAXIMO_LOCAL));

    await escribir(fixture, 'correo_institucional', 'Ana.Martinez');

    // The control shows what the user was asked for; the draft already holds the
    // address the body will carry.
    expect(elemento<HTMLInputElement>(fixture, '#correo_institucional')?.value).toBe('ana.martinez');
    expect(fixture.componentInstance.modelo().correo_institucional).toBe('ana.martinez@utn.edu.mx');

    // An address pasted whole keeps working, and the domain is not doubled.
    await escribir(fixture, 'correo_institucional', 'ana.martinez@utn.edu.mx');
    expect(fixture.componentInstance.modelo().correo_institucional).toBe('ana.martinez@utn.edu.mx');

    await escribir(fixture, 'num_empleado', '12345');
    await escribir(fixture, 'nombre', 'Ana Martínez');
    await pulsar(fixture, 'Continuar');
    await llenarPlaza(fixture, PLAZA_ADMIN);
    await pulsar(fixture, 'Continuar');
    await pulsar(fixture, 'Continuar');

    const peticion = await enviar(fixture);
    expect(peticion.request.body.correo_institucional).toBe('ana.martinez@utn.edu.mx');
    peticion.flush(CREADO, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
  });

  it('collapses the blanks of the name when the field is left', async () => {
    const fixture = await abrirFormulario();

    // The blanks go when the field loses focus, never on every keystroke: the
    // caret would fight the value being rewritten under it.
    await escribir(fixture, 'nombre', '  Ana   Martínez  ');
    expect(elemento<HTMLInputElement>(fixture, '#nombre')?.value).toBe('  Ana   Martínez  ');

    await desenfocar(fixture, 'nombre');
    expect(elemento<HTMLInputElement>(fixture, '#nombre')?.value).toBe('Ana Martínez');
  });

  it('sends the name with the blanks collapsed even if the field was never left', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = await abrirFormulario();

    await escribir(fixture, 'num_empleado', '12345');
    await escribir(fixture, 'nombre', '  Ana   Martínez  ');
    await escribir(fixture, 'correo_institucional', 'ana@utn.edu.mx');
    await pulsar(fixture, 'Continuar');
    await llenarPlaza(fixture, PLAZA_ADMIN);
    await pulsar(fixture, 'Continuar');
    await pulsar(fixture, 'Continuar');

    const peticion = await enviar(fixture);
    // The body is cleaned on its own: the summary is not the place where a name
    // is normalised, and a submit can be reached without leaving the field.
    expect(peticion.request.body.nombre).toBe('Ana Martínez');
    peticion.flush(CREADO, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
  });

  it('lets the server sentence win over the local one and drops it on the next edit', async () => {
    const fixture = await abrirFormulario();
    await irAConfirmacion(fixture);

    const peticion = await enviar(fixture);
    peticion.flush(
      {
        message: 'Los datos no son válidos.',
        errors: { correo_institucional: ['El correo debe pertenecer al dominio institucional.'] },
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();

    const servidor = elemento<HTMLElement>(fixture, '#error-correo_institucional');
    expect(servidor?.textContent).toContain('El correo debe pertenecer al dominio institucional.');

    // Editing the field drops the sentence about the value that no longer exists.
    await escribir(fixture, 'correo_institucional', 'ana.martinez@utn.edu.mx');

    expect(elemento(fixture, '#error-correo_institucional')).toBeNull();
    expect(
      elemento<HTMLInputElement>(fixture, '#correo_institucional')?.getAttribute('aria-invalid'),
    ).toBeNull();
  });

  it('refuses to send a draft that fails a rule and returns to the card that owns it', async () => {
    const fixture = await abrirFormulario();
    await irAConfirmacion(fixture);

    // A value that only fails a rule the client knows: the summary is on screen
    // while the address behind it is wrong.
    fixture.componentInstance.guardar('correo_institucional', 'ana@utn');
    await fixture.whenStable();

    await pulsar(fixture, 'Registrar empleado');

    // Nothing left the browser, and the card of the identity is back with the
    // message of the field the submit stopped at.
    expect(httpMock.match((peticion) => peticion.url === URL_EMPLEADOS).length).toBe(0);
    expect(elemento(fixture, '#area_id')).toBeNull();
    expect(
      elemento<HTMLElement>(fixture, '#error-correo_institucional')?.textContent,
    ).toContain('Escribe un correo con formato válido.');
  });

  it('refuses to render the form when the catalogs cannot be read, and retries', async () => {
    const fixture = TestBed.createComponent(AltaPage);
    await fixture.whenStable();

    httpMock
      .expectOne((peticion) => peticion.url === URL_FORMULARIO)
      .flush(
        { message: 'No autorizado.' },
        { status: 403, statusText: 'Forbidden' },
      );
    await fixture.whenStable();

    expect(host(fixture).querySelector('[role="alert"]')).not.toBeNull();
    expect(texto(fixture)).toContain('No tienes permisos para dar de alta empleados.');
    expect(host(fixture).querySelector('form')).toBeNull();

    await pulsar(fixture, 'Reintentar');

    httpMock.expectOne((peticion) => peticion.url === URL_FORMULARIO).flush(CATALOGOS);
    await fixture.whenStable();

    expect(host(fixture).querySelector('form')).not.toBeNull();
    expect(elemento(fixture, '#num_empleado')).not.toBeNull();
  });

  it('shows a structured loading skeleton, focuses step heading on step change, and focuses first invalid field on submit', async () => {
    const fixture = TestBed.createComponent(AltaPage);
    await fixture.whenStable();

    const loading = host(fixture).querySelector<HTMLElement>('.loading[role="status"]');
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    expect(loading?.querySelectorAll('.skeleton-field').length).toBeGreaterThanOrEqual(4);

    httpMock.expectOne((peticion) => peticion.url === URL_FORMULARIO).flush(CATALOGOS);
    await fixture.whenStable();

    await irAPlaza(fixture);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();

    expect(document.activeElement?.tagName).toBe('LEGEND');
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement?.textContent?.trim()).toBe('Plaza');

    await llenarPlaza(fixture, PLAZA_ADMIN);
    await pulsar(fixture, 'Continuar');
    await pulsar(fixture, 'Continuar');

    fixture.componentInstance.guardar('correo_institucional', 'invalido');
    await fixture.whenStable();
    await pulsar(fixture, 'Registrar empleado');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();

    expect(document.activeElement?.id).toBe('correo_institucional');
  });
});
