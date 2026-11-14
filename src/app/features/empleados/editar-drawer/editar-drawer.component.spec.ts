import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { environment } from '../../../../environments/environment';
import { FormularioCatalogos } from '../../../core/empleados/alta.models';
import { BORRADOR_ALTA } from '../../../core/empleados/borrador-alta';
import { CAMPOS_EDITABLES } from '../../../core/empleados/editar.service';
import { FichaEmpleado } from '../../../core/empleados/ficha.models';
import { HistorialCampo } from './historial-campo/historial-campo.component';
import { EditarDrawer } from './editar-drawer.component';

const URL_EMPLEADOS = `${environment.apiBaseUrl}/empleados`;
const URL_FORMULARIO = `${URL_EMPLEADOS}/formulario`;

/** The example the RENAPO publishes: Veracruz, 1956-04-27, female. */
const CURP = 'HEGG560427MVZRRL04';

const EMPLEADO_ID = 17;
const OTRO_ID = 18;

const AREA_ID = 3;
const PUESTO_ID = 7;

/** `200` body of the catalog endpoint, with only what this sheet reads. */
const CATALOGOS: FormularioCatalogos = {
  areas: [
    {
      id: AREA_ID,
      padre_id: null,
      nombre: 'Área A',
      tipo_area: 'Operativa',
      naturaleza: 'Adjetiva',
      orden: 1,
      asignable: true,
    },
  ],
  puestos: [{ id: PUESTO_ID, nombre: 'Analista', categoria_cct_id: 1, area_ids: [AREA_ID] }],
  categorias_cct: [{ id: 1, clave: 'CCT-01', tipo: 'administrativo', descripcion: 'Analista' }],
  niveles_estudios: [
    { id: 2, clave: 'LIC', descripcion: 'Licenciatura' },
    { id: 3, clave: 'MTR', descripcion: 'Maestría' },
  ],
  estados_civiles: [
    { id: 1, clave: 'SOL', descripcion: 'Soltero' },
    { id: 2, clave: 'CAS', descripcion: 'Casado' },
  ],
  tipos_personal: ['Sindicalizado'],
  sexos: ['Masculino', 'Femenino'],
  entidades: [{ clave: 'VZ', nombre: 'Veracruz' }],
  tipos_jornada: ['Completa'],
  trabaja_otro_lugar: ['No', 'Publico', 'Privado'],
};

/**
 * The record as the endpoint answers it.
 *
 * The birth date and the sex deliberately differ from what the CURP carries
 * (`1956-04-27` / `Femenino`): the record is the authority on both, and the edit
 * sheet must print the stored values instead of deriving them again.
 */
const FICHA: FichaEmpleado = {
  id: EMPLEADO_ID,
  identificacion: {
    num_empleado: 'US08-17',
    nombre: 'Prueba US08',
    curp: CURP,
    fecha_nacimiento: '1990-05-14',
    sexo: 'M',
    estado_civil_id: 1,
    estado_civil: 'Soltero',
    entidad_nacimiento: 'Veracruz',
  },
  plaza: {
    area_id: AREA_ID,
    area: 'Área A',
    puesto_id: PUESTO_ID,
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
    nivel_estudios_id: 2,
    nivel_estudios: 'Licenciatura',
    escuela_procedencia: 'UNAM',
    generacion: '2010-2014',
  },
  experiencia: {
    exp_publico_anios: 3,
    exp_privado_anios: 2,
    trabaja_otro_lugar: 'No',
    trabaja_otro_donde: null,
  },
  gestion_interna: {
    activo: true,
    fecha_baja: null,
    motivo_baja: null,
    nota_baja: null,
    observaciones: null,
    estado_expediente: { estado: 'completo', total_faltantes: 0, campos_faltantes: [] },
  },
};

/** A second worker, to prove a reopen does not print the previous one. */
const OTRA_FICHA: FichaEmpleado = {
  ...FICHA,
  id: OTRO_ID,
  identificacion: {
    ...FICHA.identificacion,
    num_empleado: 'US08-18',
    nombre: 'Otra Persona',
    curp: null,
    fecha_nacimiento: null,
    sexo: null,
    estado_civil_id: 2,
    estado_civil: 'Casado',
    entidad_nacimiento: null,
  },
  contacto: { correo_institucional: 'otra@utn.edu.mx' },
  estudios: {
    nivel_estudios_id: 3,
    nivel_estudios: 'Maestría',
    escuela_procedencia: 'IPN',
    generacion: '2012-2016',
  },
};

/**
 * A record whose protected values are legacy: they fail today's rules.
 *
 * The allowlist decides what may be written, so a value outside it is not the
 * user's to fix here — and it must not block the save either.
 */
const FICHA_LEGADO: FichaEmpleado = {
  ...FICHA,
  identificacion: {
    ...FICHA.identificacion,
    curp: 'LEGADO',
    fecha_nacimiento: null,
    sexo: null,
    entidad_nacimiento: null,
  },
};

/** A record with no plaza: every one of its values prints the placeholder. */
const FICHA_SIN_PLAZA: FichaEmpleado = {
  ...FICHA,
  plaza: {
    ...FICHA.plaza,
    area_id: null,
    area: null,
    puesto_id: null,
    puesto: null,
    categoria_cct_id: null,
    categoria_cct_clave: null,
    tipo_personal: null,
    tipo_jornada: null,
  },
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

function host(fixture: ComponentFixture<EditarDrawer>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/** The sheet of the folder: the only scroll container of the panel. */
function sheet(fixture: ComponentFixture<EditarDrawer>): HTMLElement {
  const elemento = host(fixture).querySelector<HTMLElement>('.sheet');
  if (elemento === null) {
    throw new Error('No sheet rendered');
  }
  return elemento;
}

function texto(fixture: ComponentFixture<EditarDrawer>): string {
  return host(fixture).textContent ?? '';
}

/** A tab of the strip, found by the label it prints. */
function tab(fixture: ComponentFixture<EditarDrawer>, etiqueta: string): HTMLButtonElement {
  const encontrado = Array.from(
    host(fixture).querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
  ).find((candidato) => (candidato.textContent ?? '').trim().startsWith(etiqueta));

  if (encontrado === undefined) {
    throw new Error(`No tab labelled ${etiqueta}`);
  }
  return encontrado;
}

/** Opens a sheet the way a pointer does. */
async function abrirTab(fixture: ComponentFixture<EditarDrawer>, etiqueta: string): Promise<void> {
  tab(fixture, etiqueta).click();
  await fixture.whenStable();
}

/** A button of the panel, by the label it reads. */
function boton(
  fixture: ComponentFixture<EditarDrawer>,
  etiqueta: string,
): HTMLButtonElement | undefined {
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
    (elemento) => (elemento.textContent ?? '').trim() === etiqueta,
  );
}

/** `id`s of every real control the sheet on screen renders. */
function idsDeControles(fixture: ComponentFixture<EditarDrawer>): string[] {
  return Array.from(sheet(fixture).querySelectorAll<HTMLElement>('input, select, textarea')).map(
    (control) => control.id,
  );
}

/** Value printed under a label, in the record drawer's read-only grammar. */
function valorDe(fixture: ComponentFixture<EditarDrawer>, etiqueta: string): string | undefined {
  const labels = Array.from(sheet(fixture).querySelectorAll('.label'));
  const label = labels.find((elemento) => elemento.textContent?.trim() === etiqueta);
  return label?.parentElement?.querySelector('.value')?.textContent?.trim();
}

/** Types into a field the way a keyboard does. */
async function escribir(
  fixture: ComponentFixture<EditarDrawer>,
  id: string,
  valor: string,
): Promise<void> {
  const control = sheet(fixture).querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (control === null) {
    throw new Error(`No field #${id} rendered`);
  }
  control.value = valor;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
}

/** Lets the queued focus move run, which is scheduled for the next task. */
async function siguienteTarea(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('EditarDrawer', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    patchDialogPrototype();
    await TestBed.configureTestingModule({
      imports: [EditarDrawer],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    httpMock.verify();
  });

  /** Creates the folder for a worker and opens it, answering its two requests. */
  async function abrir(
    id: number = EMPLEADO_ID,
    ficha: FichaEmpleado = FICHA,
  ): Promise<ComponentFixture<EditarDrawer>> {
    const fixture = TestBed.createComponent(EditarDrawer);
    fixture.componentRef.setInput('empleadoId', id);
    await fixture.whenStable();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    httpMock.expectOne(URL_FORMULARIO).flush(CATALOGOS);
    httpMock.expectOne(`${URL_EMPLEADOS}/${id}`).flush({ data: ficha });
    await fixture.whenStable();

    return fixture;
  }

  it('loads the record and prefills the draft without blanking what the record holds', async () => {
    const fixture = TestBed.createComponent(EditarDrawer);
    fixture.componentRef.setInput('empleadoId', EMPLEADO_ID);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    // The sheet has nothing to print yet, and it says so instead of painting an
    // empty form over the worker it is about to read.
    expect(fixture.componentInstance.cargando()).toBe(true);
    expect(sheet(fixture).querySelector('.skeleton')).not.toBeNull();
    expect(boton(fixture, 'Guardar')).toBeUndefined();

    httpMock.expectOne(URL_FORMULARIO).flush(CATALOGOS);
    httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}`).flush({ data: FICHA });
    await fixture.whenStable();

    const datos = fixture.componentInstance.modelo();
    expect(datos.nombre).toBe('Prueba US08');
    expect(datos.num_empleado).toBe('US08-17');
    expect(datos.curp).toBe(CURP);
    // The record wins over the CURP for both: the document is not re-interpreted
    // by the screen that edits an existing file.
    expect(datos.fecha_nacimiento).toBe('1990-05-14');
    expect(datos.sexo).toBe('M');
    // The entity is the exception: the request carries the key, never the name.
    expect(datos.entidad_nacimiento).toBe('VZ');
    expect(datos.area_id).toBe(AREA_ID);
    expect(datos.puesto_id).toBe(PUESTO_ID);
    expect(datos.estado_civil_id).toBe(1);
    expect(datos.nivel_estudios_id).toBe(2);
    expect(datos.escuela_procedencia).toBe('UNAM');
    expect(datos.generacion).toBe('2010-2014');
    expect(datos.exp_publico_anios).toBe(3);
    expect(datos.exp_privado_anios).toBe(2);
    expect(datos.trabaja_otro_lugar).toBe('No');
    expect(datos.observaciones).toBe('');

    // The sheet prints the worker it is about, with the document's values.
    expect(texto(fixture)).toContain('Prueba US08');
    expect(valorDe(fixture, 'CURP')).toBe(CURP);
    expect(valorDe(fixture, 'Fecha de nacimiento')).toBe('14 de mayo de 1990');
    expect(fixture.componentInstance.cargando()).toBe(false);
    expect(fixture.componentInstance.fallo()).toBeNull();
  });

  it('renders only the nine editable fields as controls, and every other field as a value', async () => {
    const fixture = await abrir();

    // Identificación: the only control is the state of civil status.
    expect(idsDeControles(fixture)).toEqual(['estado_civil_id']);
    expect(valorDe(fixture, 'Nombre completo')).toBe('Prueba US08');
    expect(valorDe(fixture, 'Número de empleado')).toBe('US08-17');
    expect(valorDe(fixture, 'Sexo')).toBe('M');
    expect(valorDe(fixture, 'Entidad de nacimiento')).toBe('Veracruz');
    expect(valorDe(fixture, 'Correo institucional')).toBe('persona@utn.edu.mx');
    expect(sheet(fixture).querySelector('#nombre')).toBeNull();
    expect(sheet(fixture).querySelector('#curp')).toBeNull();

    // Plaza is read-only in full: the institution owns it.
    await abrirTab(fixture, 'Plaza');
    expect(idsDeControles(fixture)).toEqual([]);
    expect(valorDe(fixture, 'Área')).toBe('Área A');
    expect(valorDe(fixture, 'Puesto')).toBe('Analista');
    expect(valorDe(fixture, 'Categoría CCT')).toBe('CCT-01');
    expect(valorDe(fixture, 'Fecha de ingreso al gobierno')).toBe('1 de septiembre de 2015');

    // Formación holds the other eight.
    await abrirTab(fixture, 'Formación');
    const formacion = idsDeControles(fixture).sort();
    expect(formacion).toEqual(
      [
        'nivel_estudios_id',
        'escuela_procedencia',
        'generacion',
        'exp_publico_anios',
        'exp_privado_anios',
        'trabaja_otro_lugar',
        'trabaja_otro_donde',
        'observaciones',
      ].sort(),
    );

    // The three sheets together offer the allowlist and nothing else.
    expect([...formacion, 'estado_civil_id'].sort()).toEqual([...CAMPOS_EDITABLES].sort());
  });

  it('prints every plaza field read-only, including the catalogue values that are empty', async () => {
    const fixture = await abrir(EMPLEADO_ID, FICHA_SIN_PLAZA);
    await abrirTab(fixture, 'Plaza');

    // No control at all: the institution owns the plaza, so nothing here is
    // something the user can type into.
    expect(idsDeControles(fixture)).toEqual([]);
    expect(sheet(fixture).querySelector('select')).toBeNull();

    // A value the record does not carry reads as such, never as an empty cell.
    for (const etiqueta of [
      'Área',
      'Puesto',
      'Categoría CCT',
      'Tipo de personal',
      'Tipo de jornada',
    ]) {
      expect(valorDe(fixture, etiqueta)).toBe('Sin registro');
    }

    // Nothing is scolded: there is no field on this sheet the user may fix.
    expect(sheet(fixture).querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps the studies and the experience editable', async () => {
    const fixture = await abrir();
    await abrirTab(fixture, 'Formación');

    for (const id of [
      'escuela_procedencia',
      'generacion',
      'exp_publico_anios',
      'exp_privado_anios',
      'observaciones',
    ]) {
      const control = sheet(fixture).querySelector<HTMLInputElement>(`#${id}`);
      expect(control).not.toBeNull();
      expect(control?.readOnly).toBe(false);
    }

    expect(sheet(fixture).querySelector<HTMLSelectElement>('#trabaja_otro_lugar')?.disabled).toBe(
      false,
    );

    // The write lands in the draft, which is what the request will carry.
    await escribir(fixture, 'generacion', '2012-2016');
    expect(fixture.componentInstance.modelo().generacion).toBe('2012-2016');
  });

  it('refuses to write a field outside the allowlist, even if the screen asks it to', async () => {
    const fixture = await abrir();
    const componente = fixture.componentInstance;

    componente.guardar('nombre', 'Otro nombre');
    componente.guardar('curp', 'XXXX000000XXXXXX00');
    componente.guardar('area_id', 99);
    componente.guardar('entidad_nacimiento', 'DF');
    componente.guardar('tipo_personal', 'Otro');
    await fixture.whenStable();

    expect(componente.modelo().nombre).toBe('Prueba US08');
    expect(componente.modelo().curp).toBe(CURP);
    expect(componente.modelo().area_id).toBe(AREA_ID);
    expect(componente.modelo().entidad_nacimiento).toBe('VZ');
    expect(componente.modelo().tipo_personal).toBe('Sindicalizado');

    // A legacy value that fails a current rule is not the user's to fix here, so
    // it does not block the save either: the CURP of the fixture is a valid one,
    // and swapping it for a broken one is exactly what the screen must not do.
    expect(componente.errorDe('curp')).toBeNull();
  });

  it('loads the record and the catalogues once, keeps identification protected and civil status editable', async () => {
    const fixture = await abrir(EMPLEADO_ID, FICHA_LEGADO);

    // One request each: the sheet reads the record it is about exactly once.
    httpMock.expectNone(URL_FORMULARIO);
    httpMock.expectNone(`${URL_EMPLEADOS}/${EMPLEADO_ID}`);

    // Every identification value is printed, not offered: the only control of
    // the sheet is the marital status.
    expect(sheet(fixture).querySelector('#nombre')).toBeNull();
    expect(sheet(fixture).querySelector('#curp')).toBeNull();
    expect(valorDe(fixture, 'Nombre completo')).toBe('Prueba US08');
    expect(sheet(fixture).querySelector<HTMLSelectElement>('#estado_civil_id')?.disabled).toBe(
      false,
    );

    // A write outside the allowlist is ignored, and a legacy value that fails a
    // current rule is not revalidated here: it cannot be fixed on this screen, so
    // it must not block the save either.
    fixture.componentInstance.guardar('nombre', 'No permitido');
    expect(fixture.componentInstance.modelo().nombre).toBe('Prueba US08');
    expect(fixture.componentInstance.errorDe('curp')).toBeNull();
    expect(fixture.componentInstance.puedeGuardar()).toBe(true);
  });

  it('sends exactly the allowlist in the PATCH, trimmed and without the protected fields', async () => {
    const fixture = await abrir();
    await abrirTab(fixture, 'Formación');

    await escribir(fixture, 'generacion', '2012-2016');
    fixture.componentInstance.guardar('observaciones', '  Nota interna  ');
    await fixture.whenStable();

    boton(fixture, 'Guardar')?.click();
    await fixture.whenStable();

    const peticion = httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}`);
    expect(peticion.request.method).toBe('PATCH');
    expect(Object.keys(peticion.request.body).sort()).toEqual([...CAMPOS_EDITABLES].sort());
    expect(peticion.request.body['nombre']).toBeUndefined();
    expect(peticion.request.body['curp']).toBeUndefined();
    expect(peticion.request.body['entidad_nacimiento']).toBeUndefined();
    expect(peticion.request.body['area_id']).toBeUndefined();

    expect(peticion.request.body['generacion']).toBe('2012-2016');
    expect(peticion.request.body['observaciones']).toBe('Nota interna');
    // A field the user cleared travels as `null`, which is how the endpoint
    // erases it; an abandoned value is never sent as `''`.
    expect(peticion.request.body['escuela_procedencia']).toBe('UNAM');
    expect(peticion.request.body['trabaja_otro_donde']).toBeNull();

    peticion.flush({ data: FICHA });
    await fixture.whenStable();
  });

  it('ignores a second save while the first one is still in flight', async () => {
    const fixture = await abrir();
    const componente = fixture.componentInstance;

    // Two presses, the way a double click does it: the second one must not even
    // reach the service, or the worker would be saved twice.
    componente.guardarCambios();
    componente.guardarCambios();
    await fixture.whenStable();

    // `expectOne` fails when the second press started a second PATCH.
    const peticion = httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}`);
    expect(peticion.request.method).toBe('PATCH');
    expect(componente.enviando()).toBe(true);

    peticion.flush({ data: FICHA });
    await fixture.whenStable();
  });

  it('lands a 422 on its field, reveals it and opens the tab that owns it', async () => {
    const fixture = await abrir();

    // The sheet on screen is Identificación; the failure belongs to Formación.
    boton(fixture, 'Guardar')?.click();
    await fixture.whenStable();

    httpMock
      .expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}`)
      .flush(
        { message: 'Los datos no son válidos.', errors: { generacion: ['Revisa la generación.'] } },
        { status: 422, statusText: 'Unprocessable Content' },
      );
    await fixture.whenStable();

    expect(tab(fixture, 'Formación').getAttribute('aria-selected')).toBe('true');
    expect(sheet(fixture).querySelector('#error-generacion')?.textContent).toContain(
      'Revisa la generación.',
    );
    expect(sheet(fixture).querySelector('#generacion')?.getAttribute('aria-invalid')).toBe('true');
    expect(sheet(fixture).querySelector('#generacion')?.getAttribute('aria-describedby')).toBe(
      'error-generacion',
    );

    await siguienteTarea();
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('generacion');
  });

  it('blocks an invalid generation, then lands a 422 on its field without losing what was typed', async () => {
    const fixture = await abrir();
    const componente = fixture.componentInstance;

    componente.guardar('generacion', '2020');
    await fixture.whenStable();
    componente.guardarCambios();
    await fixture.whenStable();

    // Nothing left the browser, and the sheet that owns the field is on screen.
    httpMock.expectNone((peticion) => peticion.method === 'PATCH');
    expect(componente.tabActiva()).toBe('formacion');
    expect(sheet(fixture).querySelector('#error-generacion')?.textContent).toContain(
      'La generación debe tener el formato AAAA-AAAA.',
    );

    componente.guardar('generacion', '2020-2024');
    componente.guardarCambios();
    await fixture.whenStable();

    httpMock
      .expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}`)
      .flush(
        { message: 'Datos inválidos', errors: { generacion: ['Revisa la generación.'] } },
        { status: 422, statusText: 'Unprocessable' },
      );
    await fixture.whenStable();

    // The typed value survives the answer, the request is no longer in flight,
    // and the server sentence is on its own field.
    expect(componente.modelo().generacion).toBe('2020-2024');
    expect(componente.enviando()).toBe(false);
    expect(componente.errorDe('generacion')).toBe('Revisa la generación.');
    expect(sheet(fixture).querySelector('#generacion')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('reports the saved record, closes, and lets the history panel read its field again', async () => {
    const fixture = await abrir();
    const guardadas: FichaEmpleado[] = [];
    fixture.componentInstance.actualizado.subscribe((ficha) => guardadas.push(ficha));

    const actualizada: FichaEmpleado = {
      ...FICHA,
      estudios: { ...FICHA.estudios, nivel_estudios_id: 3, nivel_estudios: 'Maestría' },
    };

    boton(fixture, 'Guardar')?.click();
    await fixture.whenStable();

    httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}`).flush({ data: actualizada });
    await fixture.whenStable();

    expect(guardadas).toEqual([actualizada]);
    expect(fixture.componentInstance.open()).toBe(false);
    expect(host(fixture).querySelector('dialog')?.hasAttribute('open')).toBe(false);
    // The same revision signal the edit page bumps: a save is the only thing that
    // makes an open history panel reload.
    expect(fixture.componentInstance.historialRevision()).toBe(1);
    expect(fixture.componentInstance.registroActual()?.estudios.nivel_estudios_id).toBe(3);
  });

  it('mounts the study-level history on Formación, and nowhere else', async () => {
    const fixture = await abrir();

    expect(host(fixture).querySelector('app-historial-campo')).toBeNull();

    await abrirTab(fixture, 'Formación');
    const paneles = fixture.debugElement.queryAll(By.directive(HistorialCampo));
    expect(paneles).toHaveLength(1);

    const panel = paneles[0].componentInstance as HistorialCampo;
    expect(panel.campo()).toBe('nivel_estudios_id');
    expect(panel.empleadoId()).toBe(EMPLEADO_ID);
    expect(texto(fixture)).toContain('Niveles de estudios ya registrados');
    // Deferred read: nothing is asked until the disclosure is opened.
    httpMock.expectNone((peticion) => peticion.url.includes('informacion-historial'));

    await abrirTab(fixture, 'Plaza');
    expect(host(fixture).querySelector('app-historial-campo')).toBeNull();
  });

  it('reads the history of its field only when the panel is expanded', async () => {
    const fixture = await abrir();
    await abrirTab(fixture, 'Formación');

    const panel = fixture.debugElement.query(By.directive(HistorialCampo))
      .componentInstance as HistorialCampo;
    expect(panel.campo()).toBe('nivel_estudios_id');
    expect(panel.empleadoId()).toBe(EMPLEADO_ID);
    httpMock.expectNone((peticion) => peticion.url.includes('informacion-historial'));

    panel.alternar({ target: { open: true } } as unknown as Event);
    await fixture.whenStable();

    const peticion = httpMock.expectOne(
      (r) => r.url === `${URL_EMPLEADOS}/${EMPLEADO_ID}/informacion-historial`,
    );
    // It asks for its own field and for the page size the panel prints.
    expect(peticion.request.params.get('campo')).toBe('nivel_estudios_id');
    expect(peticion.request.params.get('por_pagina')).toBe('5');
    peticion.flush({ datos: [], meta: { pagina: 1, por_pagina: 5, total: 0, total_paginas: 1 } });
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Sin cambios registrados.');
  });

  it('starts from a clean sheet when it is reopened for another worker', async () => {
    const fixture = await abrir();
    const componente = fixture.componentInstance;

    await abrirTab(fixture, 'Formación');
    await escribir(fixture, 'generacion', '2012-2016');
    expect(componente.modelo().generacion).toBe('2012-2016');

    boton(fixture, 'Cerrar')?.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 320));
    await fixture.whenStable();

    expect(componente.open()).toBe(false);
    expect(componente.modelo()).toEqual(BORRADOR_ALTA);
    expect(componente.registroActual()).toBeNull();
    expect(componente.tocado()).toEqual({});
    expect(componente.erroresServidor()).toEqual({});

    fixture.componentRef.setInput('empleadoId', OTRO_ID);
    componente.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    httpMock.expectOne(URL_FORMULARIO).flush(CATALOGOS);
    httpMock.expectOne(`${URL_EMPLEADOS}/${OTRO_ID}`).flush({ data: OTRA_FICHA });
    await fixture.whenStable();

    expect(componente.tabActiva()).toBe('identificacion');
    expect(componente.modelo().nombre).toBe('Otra Persona');
    expect(componente.registroActual()?.id).toBe(OTRO_ID);
    expect(texto(fixture)).toContain('Otra Persona');
    expect(texto(fixture)).not.toContain('Prueba US08');
  });

  it('offers the retry of a failed load, and none for an answer that will not change', async () => {
    const fixture = TestBed.createComponent(EditarDrawer);
    fixture.componentRef.setInput('empleadoId', EMPLEADO_ID);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    httpMock.expectOne(URL_FORMULARIO).flush(CATALOGOS);
    httpMock
      .expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}`)
      .flush({ message: 'Trabajador no encontrado.' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    expect(sheet(fixture).querySelector('[role="alert"]')?.textContent).toContain(
      'No encontramos ese trabajador.',
    );
    expect(boton(fixture, 'Reintentar')).toBeUndefined();

    fixture.componentInstance.open.set(false);
    await fixture.whenStable();

    fixture.componentRef.setInput('empleadoId', OTRO_ID);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    httpMock.expectOne(URL_FORMULARIO).flush(CATALOGOS);
    httpMock
      .expectOne(`${URL_EMPLEADOS}/${OTRO_ID}`)
      .flush({}, { status: 0, statusText: 'Unknown Error' });
    await fixture.whenStable();

    expect(sheet(fixture).querySelector('[role="alert"]')?.textContent).toContain(
      'No pudimos conectar con el servidor. Revisa tu conexión.',
    );

    boton(fixture, 'Reintentar')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_FORMULARIO).flush(CATALOGOS);
    httpMock.expectOne(`${URL_EMPLEADOS}/${OTRO_ID}`).flush({ data: OTRA_FICHA });
    await fixture.whenStable();

    expect(fixture.componentInstance.fallo()).toBeNull();
    expect(sheet(fixture).querySelector('[role="alert"]')).toBeNull();
    expect(texto(fixture)).toContain('Otra Persona');
  });

  it('does not leave the save enabled when the preload fails', async () => {
    const fixture = TestBed.createComponent(EditarDrawer);
    fixture.componentRef.setInput('empleadoId', EMPLEADO_ID);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    httpMock.expectOne(URL_FORMULARIO).flush(CATALOGOS);
    httpMock
      .expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}`)
      .flush({ message: 'Trabajador no encontrado.' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    // Without a record there is nothing to save over.
    expect(fixture.componentInstance.fallo()).not.toBeNull();
    expect(fixture.componentInstance.puedeGuardar()).toBe(false);

    fixture.componentInstance.guardarCambios();
    await fixture.whenStable();
    httpMock.expectNone((peticion) => peticion.method === 'PATCH');
  });
});
