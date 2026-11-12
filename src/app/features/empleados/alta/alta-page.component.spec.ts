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
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { AltaPage } from './alta-page.component';

const URL_EMPLEADOS = `${environment.apiBaseUrl}/empleados`;
const URL_FORMULARIO = `${URL_EMPLEADOS}/formulario`;

/** Assignable area of the fixture chart: the department sits at depth 2. */
const AREA_ASIGNABLE = 3;

/** Regular post and the only category of its type. */
const PUESTO_ADMIN = 7;
const CATEGORIA_ADMIN = 3;

/** `mando_medio` post and the only category of its type. */
const PUESTO_MANDO = 9;
const CATEGORIA_MANDO = 4;

/** The example the RENAPO publishes: Veracruz, 1956-04-27, female. */
const CURP_VALIDA = 'HEGG560427MVZRRL04';

/** The same CURP with a check digit that does not belong to it. */
const CURP_DIGITO_MALO = 'HEGG560427MVZRRL05';

/** The same CURP with the last character missing. */
const CURP_INCOMPLETA = 'HEGG560427MVZRRL0';

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
  ],
  puestos: [
    { id: PUESTO_ADMIN, nombre: 'Analista', tipo_puesto: 'administrativo' },
    { id: PUESTO_MANDO, nombre: 'Director de área', tipo_puesto: 'mando_medio' },
  ],
  categorias_cct: [
    { id: CATEGORIA_ADMIN, clave: 'CCT-01', tipo: 'administrativo', descripcion: 'Analista' },
    { id: CATEGORIA_MANDO, clave: 'CCT-02', tipo: 'mando_medio', descripcion: 'Dirección' },
    { id: 5, clave: 'CCT-09', tipo: 'operativo', descripcion: 'Intendencia' },
  ],
  niveles_estudios: [{ id: 2, clave: 'LIC', descripcion: 'Licenciatura' }],
  estados_civiles: [{ id: 1, clave: 'SOL', descripcion: 'Soltero' }],
  tipos_personal: ['No Aplica', 'Sindicalizado', 'No sindicalizado'],
  sexos: ['Masculino', 'Femenino'],
  municipios: [{ id: 5, nombre: 'Nezahualcóyotl', entidad: 'México' }],
  tipos_jornada: ['Matutina', 'Vespertina', 'Mixta'],
  trabaja_otro_lugar: ['No', 'Publico', 'Privado'],
};

/** Plaza of a regular post: it needs the personal type and the shift. */
interface Plaza {
  puesto: number;
  categoria: number;
  personal?: string;
  jornada?: string;
}

const PLAZA_ADMIN: Plaza = {
  puesto: PUESTO_ADMIN,
  categoria: CATEGORIA_ADMIN,
  personal: 'Sindicalizado',
  jornada: 'Matutina',
};

/** A mando medio post: the server fixes both values, so there is nothing to choose. */
const PLAZA_MANDO: Plaza = { puesto: PUESTO_MANDO, categoria: CATEGORIA_MANDO };

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

/** Labels of the options of a `<select>`, trimmed. */
function opciones(fixture: ComponentFixture<AltaPage>, id: string): string[] {
  const selector = elemento<HTMLSelectElement>(fixture, `#${id}`);
  if (selector === null) {
    throw new Error(`No select #${id} rendered`);
  }
  return Array.from(selector.options).map((opcion) => (opcion.textContent ?? '').trim());
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
  async function abrirFormulario(): Promise<ComponentFixture<AltaPage>> {
    const fixture = TestBed.createComponent(AltaPage);
    await fixture.whenStable();

    httpMock.expectOne((peticion) => peticion.url === URL_FORMULARIO).flush(CATALOGOS);
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
    await elegir(fixture, 'categoria_cct_id', plaza.categoria);
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

  it('indents the areas by their depth and refuses the ones that hold no staff', async () => {
    const fixture = await abrirFormulario();
    await irAPlaza(fixture);

    const selector = elemento<HTMLSelectElement>(fixture, '#area_id');
    expect(selector).not.toBeNull();

    const areas = Array.from(selector?.options ?? []).slice(1);
    // The chart arrives flat: the order is the one of the API, and depth is
    // spelled out with non-breaking spaces.
    expect(areas.map(textoDeOpcion)).toEqual([
      'Rectoría',
      '\u00A0\u00A0Secretaría Académica',
      '\u00A0\u00A0\u00A0\u00A0Departamento de Sistemas',
    ]);
    // Only the department can hold an employee.
    expect(areas.map((area) => area.disabled)).toEqual([true, true, false]);
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

  it('offers only the categories of the chosen post type and drops an incompatible one', async () => {
    const fixture = await abrirFormulario();
    await irAPlaza(fixture);

    // No post yet: there is no type to match, so there is nothing to choose.
    expect(opciones(fixture, 'categoria_cct_id')).toEqual(['Elegí primero un puesto']);

    await elegir(fixture, 'puesto_id', PUESTO_ADMIN);
    expect(opciones(fixture, 'categoria_cct_id')).toEqual(['Elegí una categoría', 'CCT-01 · Analista']);

    await elegir(fixture, 'categoria_cct_id', CATEGORIA_ADMIN);
    expect(elemento<HTMLSelectElement>(fixture, '#categoria_cct_id')?.value).toBe(
      String(CATEGORIA_ADMIN),
    );

    await elegir(fixture, 'puesto_id', PUESTO_MANDO);
    expect(opciones(fixture, 'categoria_cct_id')).toEqual([
      'Elegí una categoría',
      'CCT-02 · Dirección',
    ]);
    // The category of the previous post is gone from the model as well.
    expect(elemento<HTMLSelectElement>(fixture, '#categoria_cct_id')?.value).toBe('');
  });

  it('hides the personal type and the shift for a mando medio post and sends the fixed values', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = await abrirFormulario();
    await irAPlaza(fixture);

    // A regular post does ask for both.
    await elegir(fixture, 'puesto_id', PUESTO_ADMIN);
    expect(elemento(fixture, '#tipo_personal')).not.toBeNull();
    expect(elemento(fixture, '#tipo_jornada')).not.toBeNull();

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
      categoria_cct_id: CATEGORIA_ADMIN,
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
    // Nothing typed is lost: the draft survives the failure.
    expect(campo?.value).toBe('ana@utn.edu.mx');
    expect(texto(fixture)).toContain('Los datos no son válidos.');
  });

  it('keeps every choice when a later failure sends the user back to a card', async () => {
    const fixture = await abrirFormulario();
    await irAConfirmacion(fixture);

    const peticion = await enviar(fixture);
    peticion.flush(
      {
        message: 'Los datos no son válidos.',
        errors: { categoria_cct_id: ['La categoría no corresponde al puesto elegido.'] },
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();

    // The card of the plaza is back, with every choice still made: the draft is
    // never reset by a failure, and a re-created `<select>` is re-painted from
    // the model instead of falling back to its placeholder.
    expect(elemento<HTMLSelectElement>(fixture, '#area_id')?.value).toBe(String(AREA_ASIGNABLE));
    expect(elemento<HTMLSelectElement>(fixture, '#puesto_id')?.value).toBe(String(PUESTO_ADMIN));
    expect(elemento<HTMLSelectElement>(fixture, '#categoria_cct_id')?.value).toBe(
      String(CATEGORIA_ADMIN),
    );
    expect(elemento<HTMLSelectElement>(fixture, '#tipo_personal')?.value).toBe('Sindicalizado');
    expect(elemento<HTMLSelectElement>(fixture, '#tipo_jornada')?.value).toBe('Matutina');
    expect(elemento<HTMLInputElement>(fixture, '#fecha_inicio_puesto')?.value).toBe('2026-01-15');
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
      'La CURP no es válida. Revisá el formato, la entidad y el dígito verificador.',
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
    expect(texto(fixture)).toContain('Calculado desde la CURP');
    expect(nacimiento?.getAttribute('aria-describedby')).toBe('derivado-fecha_nacimiento');

    // Clearing the CURP hands both controls back, with what was already there.
    await escribir(fixture, 'curp', '');
    expect(elemento<HTMLInputElement>(fixture, '#fecha_nacimiento')?.disabled).toBe(false);
    expect(elemento<HTMLSelectElement>(fixture, '#sexo')?.disabled).toBe(false);
    expect(elemento<HTMLInputElement>(fixture, '#fecha_nacimiento')?.value).toBe('1956-04-27');
    expect(texto(fixture)).not.toContain('Calculado desde la CURP');
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
    ).toContain('Escribí un correo con formato válido.');
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
    expect(texto(fixture)).toContain('No tenés permisos para dar de alta empleados.');
    expect(host(fixture).querySelector('form')).toBeNull();

    await pulsar(fixture, 'Reintentar');

    httpMock.expectOne((peticion) => peticion.url === URL_FORMULARIO).flush(CATALOGOS);
    await fixture.whenStable();

    expect(host(fixture).querySelector('form')).not.toBeNull();
    expect(elemento(fixture, '#num_empleado')).not.toBeNull();
  });
});
