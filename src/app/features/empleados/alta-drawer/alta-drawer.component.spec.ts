import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { EmpleadoRegistrado, FormularioCatalogos } from '../../../core/empleados/alta.models';
import { BORRADOR_ALTA } from '../../../core/empleados/borrador-alta';
import { LARGO_MAXIMO_LOCAL } from '../../../core/empleados/validacion';
import { AltaDrawer } from './alta-drawer.component';

const URL_EMPLEADOS = `${environment.apiBaseUrl}/empleados`;
const URL_FORMULARIO = `${URL_EMPLEADOS}/formulario`;

/** Assignable area of the fixture chart. */
const AREA_ASIGNABLE = 3;

/** Post and the category it points at, with a type the server does not fix. */
const PUESTO_ADMIN = 7;
const CATEGORIA_ADMIN = 3;

/** `mando_medio_superior` post and the category it points at. */
const PUESTO_MANDO = 9;
const CATEGORIA_MANDO = 4;

/** The example the RENAPO publishes: Veracruz, 1956-04-27, female. */
const CURP_VALIDA = 'HEGG560427MVZRRL04';

/** Same document, with a check digit that does not belong to it. */
const CURP_DIGITO_MALO = 'HEGG560427MVZRRL05';

/** `200` body of the catalog endpoint, straight from the contract. */
const CATALOGOS: FormularioCatalogos = {
  areas: [
    {
      id: AREA_ASIGNABLE,
      padre_id: null,
      nombre: 'Departamento de Sistemas',
      tipo_area: 'Operativa',
      naturaleza: 'Adjetiva',
      orden: 1,
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
  ],
  categorias_cct: [
    { id: CATEGORIA_ADMIN, clave: 'CCT-01', tipo: 'administrativo', descripcion: 'Analista' },
    {
      id: CATEGORIA_MANDO,
      clave: 'CCT-02',
      tipo: 'mando_medio_superior',
      descripcion: 'Dirección',
    },
  ],
  niveles_estudios: [{ id: 2, clave: 'LIC', descripcion: 'Licenciatura' }],
  estados_civiles: [{ id: 1, clave: 'SOL', descripcion: 'Soltero' }],
  tipos_personal: ['No Aplica', 'Sindicalizado', 'No sindicalizado'],
  sexos: ['Masculino', 'Femenino'],
  entidades: [
    { clave: 'VZ', nombre: 'Veracruz' },
    { clave: 'DF', nombre: 'Ciudad de México' },
  ],
  tipos_jornada: ['Matutina', 'Mixta'],
  trabaja_otro_lugar: ['No', 'Publico', 'Privado'],
};

const CREADO: EmpleadoRegistrado = {
  id: 42,
  num_empleado: '12345',
  nombre: 'Ana Martínez',
  correo_institucional: 'ana@utn.edu.mx',
  activo: true,
};

/**
 * jsdom ships `HTMLDialogElement` without `showModal` / `close`, and the folder
 * is a native `<dialog>`: without these two the panel never opens.
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

function host(fixture: ComponentFixture<AltaDrawer>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function texto(fixture: ComponentFixture<AltaDrawer>): string {
  return host(fixture).textContent ?? '';
}

/** A tab of the strip, found by the label it prints. */
function tab(fixture: ComponentFixture<AltaDrawer>, etiqueta: string): HTMLButtonElement {
  const encontrado = Array.from(
    host(fixture).querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
  ).find((candidato) => (candidato.textContent ?? '').trim().startsWith(etiqueta));

  if (encontrado === undefined) {
    throw new Error(`No tab labelled ${etiqueta}`);
  }
  return encontrado;
}

/** Opens a sheet the way a pointer does. */
async function abrirTab(fixture: ComponentFixture<AltaDrawer>, etiqueta: string): Promise<void> {
  tab(fixture, etiqueta).click();
  await fixture.whenStable();
}

/** Badge of a tab, or `undefined` when the tab owns no invalid field. */
function insignia(fixture: ComponentFixture<AltaDrawer>, etiqueta: string): string | undefined {
  return tab(fixture, etiqueta).querySelector('.nb')?.textContent?.trim();
}

function campo<T extends HTMLElement>(fixture: ComponentFixture<AltaDrawer>, id: string): T | null {
  return host(fixture).querySelector<T>(`#${id}`);
}

/** Types into a text, date or number field the way a keyboard does. */
async function escribir(
  fixture: ComponentFixture<AltaDrawer>,
  id: string,
  valor: string,
): Promise<void> {
  const control = campo<HTMLInputElement | HTMLTextAreaElement>(fixture, id);
  if (control === null) {
    throw new Error(`No field #${id} rendered`);
  }
  control.value = valor;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
}

/** Chooses an option of a `<select>` by the value the contract carries. */
async function elegir(
  fixture: ComponentFixture<AltaDrawer>,
  id: string,
  valor: string | number,
): Promise<void> {
  const selector = campo<HTMLSelectElement>(fixture, id);
  if (selector === null) {
    throw new Error(`No select #${id} rendered`);
  }
  selector.value = String(valor);
  selector.dispatchEvent(new Event('change', { bubbles: true }));
  await fixture.whenStable();
}

/** The one action that sends the draft. */
function enviarBoton(fixture: ComponentFixture<AltaDrawer>): HTMLButtonElement {
  const boton = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button.action')).find(
    (candidato) => (candidato.textContent ?? '').trim() === 'Registrar empleado',
  );

  if (boton === undefined) {
    throw new Error('No submit button rendered');
  }
  return boton;
}

describe('AltaDrawer', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    patchDialogPrototype();
    await TestBed.configureTestingModule({
      imports: [AltaDrawer],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    httpMock.verify();
  });

  /** Creates the folder and opens it, answering the single catalog request. */
  async function abrir(
    catalogos: FormularioCatalogos = CATALOGOS,
  ): Promise<ComponentFixture<AltaDrawer>> {
    const fixture = TestBed.createComponent(AltaDrawer);
    await fixture.whenStable();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    httpMock.expectOne((peticion) => peticion.url === URL_FORMULARIO).flush(catalogos);
    await fixture.whenStable();

    return fixture;
  }

  /** Fills the three required fields of `Identificación`. */
  async function llenarIdentificacion(fixture: ComponentFixture<AltaDrawer>): Promise<void> {
    await escribir(fixture, 'num_empleado', '12345');
    await escribir(fixture, 'nombre', 'Ana Martínez');
    await escribir(fixture, 'correo_institucional', 'ana');
  }

  /** Completes `Plaza` with one regular post. */
  async function llenarPlaza(
    fixture: ComponentFixture<AltaDrawer>,
    puesto: number = PUESTO_ADMIN,
  ): Promise<void> {
    await abrirTab(fixture, 'Plaza');
    await elegir(fixture, 'area_id', AREA_ASIGNABLE);
    await elegir(fixture, 'puesto_id', puesto);
    await escribir(fixture, 'fecha_inicio_puesto', '2026-01-15');

    // A mando medio post fixes both values, and the sheet hides the controls.
    if (campo(fixture, 'tipo_personal') !== null) {
      await elegir(fixture, 'tipo_personal', 'Sindicalizado');
      await elegir(fixture, 'tipo_jornada', 'Matutina');
    }
  }

  /** Presses the submit and returns the request it started, if it started one. */
  async function registrar(fixture: ComponentFixture<AltaDrawer>): Promise<TestRequest | null> {
    await abrirTab(fixture, 'Revisión');
    enviarBoton(fixture).click();
    await fixture.whenStable();

    const [peticion] = httpMock.match((candidato) => candidato.url === URL_EMPLEADOS);
    return peticion ?? null;
  }

  it('opens the folder on the four sheets of the alta, with the identity one on screen', async () => {
    const fixture = await abrir();

    const etiquetas = Array.from(host(fixture).querySelectorAll('button[role="tab"]')).map(
      (boton) => {
        // The badge is part of the tab's own text; the label is what it names.
        const copia = boton.cloneNode(true) as HTMLElement;
        copia.querySelectorAll('.nb').forEach((insignia) => insignia.remove());
        return (copia.textContent ?? '').trim();
      },
    );
    expect(etiquetas).toEqual(['Identificación', 'Plaza', 'Formación', 'Revisión']);

    // The paper shell travels with it: the drawer is mounted once, next to the
    // roster, and this is the folder it paints when it opens.
    expect(host(fixture).querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(host(fixture).querySelector('.sheet')).not.toBeNull();
    expect(host(fixture).querySelector('.cover')).not.toBeNull();

    // The first sheet carries the identity fields, and only those.
    expect(campo(fixture, 'num_empleado')).not.toBeNull();
    expect(campo(fixture, 'curp')).not.toBeNull();
    expect(campo(fixture, 'correo_institucional')).not.toBeNull();
    expect(campo(fixture, 'area_id')).toBeNull();

    // The css of the strip and the sheet is not what makes them work: the tab on
    // screen is the selected one, and it is the one the panel is labelled by.
    expect(tab(fixture, 'Identificación').getAttribute('aria-selected')).toBe('true');
    expect(host(fixture).querySelector('#alta-panel')?.getAttribute('aria-labelledby')).toBe(
      'alta-tab-0',
    );
  });

  it('switches sheets on a click and on the arrow keys, without blocking any of them', async () => {
    const fixture = await abrir();

    await abrirTab(fixture, 'Plaza');
    expect(campo(fixture, 'area_id')).not.toBeNull();
    expect(campo(fixture, 'num_empleado')).toBeNull();

    // A sheet with errors opens like any other: navigation is never a gate.
    expect(campo(fixture, 'error-area_id')).toBeNull();
    expect(tab(fixture, 'Plaza').getAttribute('aria-selected')).toBe('true');
    expect(tab(fixture, 'Identificación').getAttribute('tabindex')).toBe('-1');

    const tira = host(fixture).querySelector<HTMLElement>('.tabs');
    tira?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();

    expect(tab(fixture, 'Formación').getAttribute('aria-selected')).toBe('true');
    expect(campo(fixture, 'nivel_estudios_id')).not.toBeNull();

    tira?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await fixture.whenStable();

    expect(tab(fixture, 'Revisión').getAttribute('aria-selected')).toBe('true');
    expect(texto(fixture)).toContain('Confirmación');
  });

  it('counts the invalid fields of each sheet in a labelled badge', async () => {
    const fixture = await abrir();

    // Nothing typed yet: three required fields on the identity sheet, five on
    // the plaza (the area, the post, the start date and the two values the
    // server does not fix for a regular post).
    expect(insignia(fixture, 'Identificación')).toBe('3');
    expect(insignia(fixture, 'Plaza')).toBe('5');
    expect(insignia(fixture, 'Formación')).toBeUndefined();
    expect(insignia(fixture, 'Revisión')).toBeUndefined();

    // The count is announced as a sentence, never as a naked number.
    expect(tab(fixture, 'Identificación').querySelector('.nb')?.getAttribute('aria-label')).toBe(
      '3 campos con error',
    );

    await llenarIdentificacion(fixture);
    await fixture.whenStable();

    // Fixing the three of them empties the badge: it is a count, not a mark.
    expect(insignia(fixture, 'Identificación')).toBeUndefined();
    expect(insignia(fixture, 'Plaza')).toBe('5');

    // A post without the type and the shift still needs them, so the count only
    // loses the area, the post and the date.
    await abrirTab(fixture, 'Plaza');
    await elegir(fixture, 'area_id', AREA_ASIGNABLE);
    await elegir(fixture, 'puesto_id', PUESTO_ADMIN);
    await escribir(fixture, 'fecha_inicio_puesto', '2026-01-15');
    expect(insignia(fixture, 'Plaza')).toBe('2');
  });

  it('does not send a draft that fails a rule: it reveals it, opens its sheet and focuses the field', async () => {
    const fixture = await abrir();
    await llenarIdentificacion(fixture);

    // The identity sheet is complete; the plaza is untouched.
    const peticion = await registrar(fixture);
    expect(peticion).toBeNull();

    expect(tab(fixture, 'Plaza').getAttribute('aria-selected')).toBe('true');
    expect(campo(fixture, 'error-area_id')?.textContent).toContain('Elige una opción.');
    expect(campo<HTMLSelectElement>(fixture, 'area_id')?.getAttribute('aria-invalid')).toBe('true');

    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('area_id');
  });

  it('reveals a broken CURP on its own sheet before anything leaves the browser', async () => {
    const fixture = await abrir();
    await llenarIdentificacion(fixture);
    await escribir(fixture, 'curp', CURP_DIGITO_MALO);
    await llenarPlaza(fixture);

    const peticion = await registrar(fixture);
    expect(peticion).toBeNull();

    // The first field that fails is on the first sheet, so that is where the
    // folder goes — and the sentence is the one the backend collapses to.
    expect(tab(fixture, 'Identificación').getAttribute('aria-selected')).toBe('true');
    expect(campo(fixture, 'error-curp')?.textContent).toContain('La CURP no es válida.');
    // The specific motivo travels in the `title`, never as a second sentence.
    expect(campo(fixture, 'error-curp')?.getAttribute('title')).toBe(
      'El dígito verificador no coincide con el resto de la CURP.',
    );
  });

  it('posts a clean draft with the derived entity and the full institutional address', async () => {
    const fixture = await abrir();
    await llenarIdentificacion(fixture);
    await escribir(fixture, 'curp', CURP_VALIDA);

    // The control asks for the local part; the draft already holds the address.
    expect(campo<HTMLInputElement>(fixture, 'correo_institucional')?.value).toBe('ana');
    expect(fixture.componentInstance.modelo().correo_institucional).toBe('ana@utn.edu.mx');
    expect(
      campo<HTMLInputElement>(fixture, 'correo_institucional')?.getAttribute('maxlength'),
    ).toBe(String(LARGO_MAXIMO_LOCAL));
    // The three values the document carries are locked from the first render.
    expect(campo<HTMLInputElement>(fixture, 'fecha_nacimiento')?.value).toBe('1956-04-27');
    expect(campo<HTMLSelectElement>(fixture, 'sexo')?.value).toBe('Femenino');
    expect(campo<HTMLInputElement>(fixture, 'entidad_nacimiento')?.value).toBe('Veracruz');

    await llenarPlaza(fixture);

    const peticion = await registrar(fixture);
    expect(peticion).not.toBeNull();

    expect(peticion?.request.body).toMatchObject({
      num_empleado: '12345',
      nombre: 'Ana Martínez',
      correo_institucional: 'ana@utn.edu.mx',
      area_id: AREA_ASIGNABLE,
      puesto_id: PUESTO_ADMIN,
      fecha_inicio_puesto: '2026-01-15',
      tipo_personal: 'Sindicalizado',
      tipo_jornada: 'Matutina',
      curp: CURP_VALIDA,
      // The three values the document carries, locked on screen.
      fecha_nacimiento: '1956-04-27',
      sexo: 'Femenino',
      entidad_nacimiento: 'VZ',
      trabaja_otro_lugar: 'No',
    });
    // Prohibited: the server derives the category from the post, and the "where
    // else" detail must not travel when the answer is `No`.
    expect(Object.hasOwn(peticion?.request.body ?? {}, 'categoria_cct_id')).toBe(false);
    expect(Object.hasOwn(peticion?.request.body ?? {}, 'trabaja_otro_donde')).toBe(false);
  });

  it('sends the two values a mando medio post fixes and hides their controls', async () => {
    const fixture = await abrir();
    await llenarIdentificacion(fixture);

    await abrirTab(fixture, 'Plaza');
    await elegir(fixture, 'area_id', AREA_ASIGNABLE);
    await elegir(fixture, 'puesto_id', PUESTO_MANDO);
    await escribir(fixture, 'fecha_inicio_puesto', '2026-01-15');

    expect(campo(fixture, 'tipo_personal')).toBeNull();
    expect(campo(fixture, 'tipo_jornada')).toBeNull();
    expect(texto(fixture)).toContain('Puesto de mando medio');

    const peticion = await registrar(fixture);
    expect(peticion?.request.body.tipo_personal).toBe('No Aplica');
    expect(peticion?.request.body.tipo_jornada).toBe('Mixta');
  });

  it('maps a 422 to its field, opens that sheet and shows the server sentence', async () => {
    const fixture = await abrir();
    await llenarIdentificacion(fixture);
    await llenarPlaza(fixture);

    const peticion = await registrar(fixture);
    peticion?.flush(
      {
        message: 'Los datos no son válidos.',
        errors: { correo_institucional: ['El correo debe pertenecer al dominio institucional.'] },
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();

    // The sentence wins over the local one, and the folder goes to its field.
    expect(tab(fixture, 'Identificación').getAttribute('aria-selected')).toBe('true');

    const aviso = campo(fixture, 'error-correo_institucional');
    expect(aviso?.getAttribute('role')).toBe('alert');
    expect(aviso?.textContent).toContain('El correo debe pertenecer al dominio institucional.');
    expect(campo(fixture, 'correo_institucional')?.getAttribute('aria-describedby')).toBe(
      'error-correo_institucional',
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('correo_institucional');
  });

  it('keeps a message that belongs to no sheet, because no field can carry it', async () => {
    const fixture = await abrir();
    await llenarIdentificacion(fixture);
    await llenarPlaza(fixture);

    const peticion = await registrar(fixture);
    peticion?.flush(
      {
        message: 'Los datos no son válidos.',
        errors: { categoria_cct_id: ['La categoría no se puede enviar.'] },
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();

    // It stays on the sheet that is on screen, above the form.
    expect(tab(fixture, 'Revisión').getAttribute('aria-selected')).toBe('true');
    expect(texto(fixture)).toContain('Los datos no son válidos.');
    expect(texto(fixture)).toContain('La categoría no se puede enviar.');
  });

  it('reports the created employee, closes the folder and starts from a clean draft', async () => {
    const fixture = await abrir();
    const creados: EmpleadoRegistrado[] = [];
    fixture.componentInstance.registrado.subscribe((empleado) => creados.push(empleado));

    await llenarIdentificacion(fixture);
    await llenarPlaza(fixture);

    const peticion = await registrar(fixture);
    peticion?.flush(CREADO, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    expect(creados).toEqual([CREADO]);
    expect(fixture.componentInstance.open()).toBe(false);
    expect(host(fixture).querySelector('dialog')?.hasAttribute('open')).toBe(false);

    // The draft outlives the close long enough for the exit transition, and then
    // it is gone: the next folder is a new file, not the one just registered.
    await new Promise((resolve) => setTimeout(resolve, 320));
    await fixture.whenStable();
    expect(fixture.componentInstance.modelo()).toEqual(BORRADOR_ALTA);

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host(fixture).querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(tab(fixture, 'Identificación').getAttribute('aria-selected')).toBe('true');
    expect(campo<HTMLInputElement>(fixture, 'num_empleado')?.value).toBe('');
    expect(campo<HTMLInputElement>(fixture, 'correo_institucional')?.value).toBe('');
    expect(insignia(fixture, 'Identificación')).toBe('3');
  });

  it('leaves the draft empty after a close that was not a registration', async () => {
    const fixture = await abrir();
    await llenarIdentificacion(fixture);
    expect(fixture.componentInstance.modelo().num_empleado).toBe('12345');

    // No discard banner in this slice: closing discards, and it asks nothing.
    const cerrar = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
      (boton) => (boton.textContent ?? '').trim() === 'Cerrar',
    );
    cerrar?.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 320));
    await fixture.whenStable();

    expect(fixture.componentInstance.open()).toBe(false);
    expect(fixture.componentInstance.modelo()).toEqual(BORRADOR_ALTA);

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(campo<HTMLInputElement>(fixture, 'num_empleado')?.value).toBe('');
  });

  it('shows the catalogue failure on the sheet and retries it in place', async () => {
    const fixture = TestBed.createComponent(AltaDrawer);
    await fixture.whenStable();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    httpMock
      .expectOne((peticion) => peticion.url === URL_FORMULARIO)
      .flush({ message: 'No autorizado.' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();

    // Without catalogues there is nothing to choose from, so no field is drawn.
    expect(campo(fixture, 'num_empleado')).toBeNull();
    expect(host(fixture).querySelector('[role="alert"]')?.textContent).toContain(
      'No tienes permisos para dar de alta empleados.',
    );

    const reintentar = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
      (boton) => (boton.textContent ?? '').trim() === 'Reintentar',
    );
    reintentar?.click();
    await fixture.whenStable();

    httpMock.expectOne((peticion) => peticion.url === URL_FORMULARIO).flush(CATALOGOS);
    await fixture.whenStable();

    expect(campo(fixture, 'num_empleado')).not.toBeNull();
    expect(host(fixture).querySelector('[role="alert"]')).toBeNull();
  });
});
