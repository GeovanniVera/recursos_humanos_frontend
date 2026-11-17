import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { FormularioCatalogos } from '../../../core/empleados/alta.models';
import { FichaEmpleado } from '../../../core/empleados/ficha.models';
import { EditarDrawer } from './editar-drawer.component';

const URL_EMPLEADOS = `${environment.apiBaseUrl}/empleados`;
const URL_FORMULARIO = `${URL_EMPLEADOS}/formulario`;

const EMPLEADO_ID = 17;

const CATALOGOS: FormularioCatalogos = {
  areas: [
    {
      id: 3,
      padre_id: null,
      nombre: 'Área A',
      tipo_area: 'Operativa',
      naturaleza: 'Adjetiva',
      orden: 1,
      asignable: true,
    },
  ],
  puestos: [
    { id: 7, nombre: 'Analista', categoria_cct_id: 1, area_ids: [3] },
    { id: 8, nombre: 'Jefe de Área', categoria_cct_id: 2, area_ids: [3] },
  ],
  categorias_cct: [
    { id: 1, clave: 'CCT-01', tipo: 'administrativo', descripcion: 'Analista' },
    { id: 2, clave: 'CCT-02', tipo: 'mando_medio_superior', descripcion: 'Jefe de Área' },
  ],
  niveles_estudios: [
    { id: 2, clave: 'LIC', descripcion: 'Licenciatura' },
    { id: 3, clave: 'MTR', descripcion: 'Maestría' },
  ],
  estados_civiles: [
    { id: 1, clave: 'SOL', descripcion: 'Soltero' },
    { id: 2, clave: 'CAS', descripcion: 'Casado' },
  ],
  tipos_personal: ['No Aplica', 'Sindicalizado', 'No sindicalizado'],
  sexos: ['Masculino', 'Femenino'],
  entidades: [{ clave: 'VZ', nombre: 'Veracruz' }],
  tipos_jornada: ['Mixta', 'Matutina', 'Vespertina'],
  trabaja_otro_lugar: ['No', 'Publico', 'Privado'],
};

const CAMPOS = ['estado_civil_id', 'exp_publico_anios', 'exp_privado_anios', 'observaciones'];

function ficha(cambios: Partial<FichaEmpleado> = {}): FichaEmpleado {
  return {
    id: EMPLEADO_ID,
    actualizado_en: '2026-01-01T00:00:00+00:00',
    identificacion: {
      num_empleado: 'US08-17',
      nombre: 'Prueba US08',
      curp: 'HEGG560427MVZRRL04',
      fecha_nacimiento: '1990-05-14',
      sexo: 'M',
      estado_civil_id: 1,
      estado_civil: 'Soltero',
      entidad_nacimiento: 'Veracruz',
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
      tipo_jornada: 'Matutina',
      fecha_inicio_puesto: '2020-01-15',
      fecha_ingreso_institucion: '2018-03-01',
      fecha_ingreso_gobierno: '2015-09-01',
      antiguedad: { anios: 7, meses: 4, dias: 12, texto: '7 años, 4 meses' },
    },
    contacto: { correo_institucional: 'persona@utn.edu.mx' },
    experiencia: { exp_publico_anios: 5, exp_privado_anios: 3 },
    gestion_interna: {
      estatus: 'activo',
      fecha_baja: null,
      motivo_baja: null,
      nota_baja: null,
      observaciones: null,
      estado_expediente: { estado: 'completo', total_faltantes: 0, campos_faltantes: [] },
    },
    edicion: { campos_editables: CAMPOS },
    grados_academicos: [
      {
        id: 31,
        nivel_estudios_id: 2,
        nivel_estudios: 'Licenciatura',
        titulo_o_carrera: 'Licenciatura en Sistemas',
        escuela_procedencia: 'UNAM',
        generacion: '2012-2016',
        cedula_profesional: null,
        es_maximo: true,
      },
    ],
    empleos_externos: [],
    ...cambios,
  };
}

/** jsdom ships `HTMLDialogElement` without the dialog API. */
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

function texto(fixture: ComponentFixture<EditarDrawer>): string {
  return host(fixture).textContent ?? '';
}

function boton(
  fixture: ComponentFixture<EditarDrawer>,
  etiqueta: string,
): HTMLButtonElement | undefined {
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
    (elemento) => (elemento.textContent ?? '').trim() === etiqueta,
  );
}

function valorDe(fixture: ComponentFixture<EditarDrawer>, etiqueta: string): string | undefined {
  const labels = Array.from(host(fixture).querySelectorAll('.label'));
  const label = labels.find((elemento) => elemento.textContent?.trim() === etiqueta);
  return label?.parentElement?.querySelector('.value')?.textContent?.trim();
}

function campo<T extends HTMLElement>(
  fixture: ComponentFixture<EditarDrawer>,
  id: string,
): T | null {
  return host(fixture).querySelector<T>(`#${id}`);
}

async function escribir(
  fixture: ComponentFixture<EditarDrawer>,
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

async function elegir(
  fixture: ComponentFixture<EditarDrawer>,
  id: string,
  valor: string,
): Promise<void> {
  const control = campo<HTMLSelectElement>(fixture, id);
  if (control === null) {
    throw new Error(`No select #${id} rendered`);
  }
  control.value = valor;
  control.dispatchEvent(new Event('change', { bubbles: true }));
  await fixture.whenStable();
}

async function marcar(fixture: ComponentFixture<EditarDrawer>, selector: string): Promise<void> {
  const control = host(fixture).querySelector<HTMLInputElement>(selector);
  if (control === null) {
    throw new Error(`No checkbox ${selector}`);
  }
  control.checked = true;
  control.dispatchEvent(new Event('change', { bubbles: true }));
  await fixture.whenStable();
}

async function abrirTab(fixture: ComponentFixture<EditarDrawer>, etiqueta: string): Promise<void> {
  const tab = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (elemento) => (elemento.textContent ?? '').includes(etiqueta),
  );
  if (tab === undefined) {
    throw new Error(`No tab ${etiqueta}`);
  }
  tab.click();
  await fixture.whenStable();
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

  async function abrir(registro: FichaEmpleado = ficha()): Promise<ComponentFixture<EditarDrawer>> {
    const fixture = TestBed.createComponent(EditarDrawer);
    fixture.componentRef.setInput('empleadoId', EMPLEADO_ID);
    await fixture.whenStable();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    responder(fixture, registro);
    return fixture;
  }

  function responder(fixture: ComponentFixture<EditarDrawer>, registro: FichaEmpleado): void {
    httpMock.expectOne(URL_FORMULARIO).flush(CATALOGOS);
    httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}`).flush({ data: registro });
    fixture.detectChanges();
  }

  it('paints the official data and offers only the fields the policy allows', async () => {
    const fixture = await abrir();
    await fixture.whenStable();

    expect(valorDe(fixture, 'Número de empleado')).toBe('US08-17');
    expect(valorDe(fixture, 'CURP')).toBe('HEGG560427MVZRRL04');
    expect(campo(fixture, 'estado_civil_id')).not.toBeNull();

    // El 404 del historial de campos no se consulta nunca.
    httpMock.expectNone((peticion) => peticion.url.includes('informacion-historial'));
  });

  it('sends only the changed scalar together with the concurrency token', async () => {
    const fixture = await abrir();

    // Sin cambios no hay nada que guardar.
    expect(boton(fixture, 'Guardar cambios')?.disabled).toBe(true);

    await elegir(fixture, 'estado_civil_id', '2');

    expect(boton(fixture, 'Guardar cambios')?.disabled).toBe(false);
    boton(fixture, 'Guardar cambios')?.click();
    await fixture.whenStable();

    const peticion = httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({
      estado_civil_id: 2,
      updated_at: '2026-01-01T00:00:00+00:00',
    });

    const guardada = ficha();
    peticion.flush({
      data: {
        ...guardada,
        actualizado_en: '2026-02-02T10:00:00+00:00',
        identificacion: { ...guardada.identificacion, estado_civil_id: 2, estado_civil: 'Casado' },
      },
    });
    await fixture.whenStable();

    // La carpeta no se cierra: sigue abierta y confirma el guardado.
    expect(fixture.componentInstance.open()).toBe(true);
    expect(texto(fixture)).toContain('Cambios guardados.');
    expect(boton(fixture, 'Guardar cambios')?.disabled).toBe(true);
  });

  it('shows the conflict and offers reloading the record', async () => {
    const fixture = await abrir();

    await elegir(fixture, 'estado_civil_id', '2');
    boton(fixture, 'Guardar cambios')?.click();
    await fixture.whenStable();

    httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}`).flush(
      {
        mensaje: 'El expediente cambió desde que lo abriste. Recarga la ficha y vuelve a intentar.',
        codigo: 'conflicto_concurrencia',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(texto(fixture)).toContain('cambió desde que lo abriste');

    boton(fixture, 'Recargar ficha')?.click();
    await fixture.whenStable();

    responder(fixture, ficha());
    await fixture.whenStable();

    expect(texto(fixture)).not.toContain('cambió desde que lo abriste');
  });

  it('keeps the plaza sheet read-only, without a save action', async () => {
    const fixture = await abrir();
    await abrirTab(fixture, 'Plaza');

    expect(valorDe(fixture, 'Área')).toBe('Área A');
    expect(boton(fixture, 'Guardar cambios')).toBeUndefined();
    expect(boton(fixture, 'Ver historial de adscripciones →')).toBeDefined();
    expect(boton(fixture, 'Registrar cambio de adscripción →')).toBeDefined();
  });

  it('adds an academic grade from its inline form', async () => {
    const fixture = await abrir();
    await abrirTab(fixture, 'Formación');

    expect(texto(fixture)).toContain('Licenciatura en Sistemas');

    boton(fixture, '+ Agregar grado académico')?.click();
    await fixture.whenStable();

    await elegir(fixture, 'editar-grado-nivel', '3');
    await escribir(fixture, 'editar-grado-titulo', 'Maestría en Redes');
    await escribir(fixture, 'editar-grado-escuela', 'IPN');

    boton(fixture, 'Guardar grado')?.click();
    await fixture.whenStable();

    const peticion = httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}/grados`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(
      expect.objectContaining({
        nivel_estudios_id: 3,
        titulo_o_carrera: 'Maestría en Redes',
        escuela_procedencia: 'IPN',
      }),
    );

    peticion.flush({
      data: ficha({
        grados_academicos: [
          ...ficha().grados_academicos,
          {
            id: 32,
            nivel_estudios_id: 3,
            nivel_estudios: 'Maestría',
            titulo_o_carrera: 'Maestría en Redes',
            escuela_procedencia: 'IPN',
            generacion: null,
            cedula_profesional: null,
            es_maximo: false,
          },
        ],
      }),
    });
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Maestría en Redes');
  });

  it('disables the scalars the actor cannot write', async () => {
    const fixture = await abrir(ficha({ edicion: { campos_editables: ['estado_civil_id'] } }));
    await abrirTab(fixture, 'Formación');

    expect(campo<HTMLTextAreaElement>(fixture, 'observaciones')?.disabled).toBe(true);
    expect(campo<HTMLInputElement>(fixture, 'exp_publico_anios')?.disabled).toBe(true);
  });

  it('shows the appointment history in its annex', async () => {
    const fixture = await abrir();
    await abrirTab(fixture, 'Plaza');

    boton(fixture, 'Ver historial de adscripciones →')?.click();
    await fixture.whenStable();

    httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}/historial`).flush({
      data: [
        {
          id: 51,
          desde: '2020-01-15',
          hasta: null,
          area_id: 3,
          area: 'Área A',
          puesto_id: 7,
          puesto: 'Analista',
          categoria_cct_id: 1,
          categoria_cct_clave: 'CCT-01',
          motivo: 'Alta',
          estado: 'vigente',
        },
      ],
    });
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Analista');
    expect(texto(fixture)).toContain('Vigente');
    expect(texto(fixture)).toContain('Anexo al folio US08-17');
  });

  it('registers an assignment change and returns to the plaza sheet', async () => {
    const fixture = await abrir();
    await abrirTab(fixture, 'Plaza');

    boton(fixture, 'Registrar cambio de adscripción →')?.click();
    await fixture.whenStable();

    // The form opens on the current appointment, with its working condition.
    expect(campo<HTMLSelectElement>(fixture, 'adsc-area')?.value).toBe('3');
    expect(campo<HTMLSelectElement>(fixture, 'adsc-tipo-personal')?.value).toBe('Sindicalizado');
    expect(campo<HTMLSelectElement>(fixture, 'adsc-tipo-jornada')?.value).toBe('Matutina');
    expect(texto(fixture)).toContain('CCT-01');

    await elegir(fixture, 'adsc-tipo-personal', 'No sindicalizado');
    await elegir(fixture, 'adsc-tipo-jornada', 'Vespertina');
    await escribir(fixture, 'adsc-nota', 'Cambio de plaza aprobado');

    expect(boton(fixture, 'Registrar cambio')?.disabled).toBe(false);
    boton(fixture, 'Registrar cambio')?.click();
    await fixture.whenStable();

    const peticion = httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}/adscripcion`);
    expect(peticion.request.body).toEqual({
      area_id: 3,
      puesto_id: 7,
      tipo_personal: 'No sindicalizado',
      tipo_jornada: 'Vespertina',
      nota: 'Cambio de plaza aprobado',
    });

    peticion.flush({ data: ficha() });
    await fixture.whenStable();

    expect(fixture.componentInstance.tabActiva()).toBe('plaza');
    expect(fixture.componentInstance.vistaL2()).toBeNull();
    expect(texto(fixture)).toContain('Cambios guardados.');
  });

  it('asks for the working condition of a non-management post before saving', async () => {
    const fixture = await abrir(
      ficha({ plaza: { ...ficha().plaza, tipo_personal: null, tipo_jornada: null } }),
    );
    await abrirTab(fixture, 'Plaza');

    boton(fixture, 'Registrar cambio de adscripción →')?.click();
    await fixture.whenStable();

    const personal = campo<HTMLSelectElement>(fixture, 'adsc-tipo-personal');
    const jornada = campo<HTMLSelectElement>(fixture, 'adsc-tipo-jornada');

    expect(personal).not.toBeNull();
    expect(jornada).not.toBeNull();
    expect(personal?.disabled).toBe(false);
    expect(jornada?.disabled).toBe(false);

    // Without a post and without a condition there is nothing to send.
    expect(boton(fixture, 'Registrar cambio')?.disabled).toBe(true);

    await elegir(fixture, 'adsc-tipo-personal', 'Sindicalizado');
    expect(boton(fixture, 'Registrar cambio')?.disabled).toBe(true);

    await elegir(fixture, 'adsc-tipo-jornada', 'Mixta');
    expect(boton(fixture, 'Registrar cambio')?.disabled).toBe(false);
  });

  it('fixes the working condition of a management post instead of asking for it', async () => {
    const fixture = await abrir();
    await abrirTab(fixture, 'Plaza');

    boton(fixture, 'Registrar cambio de adscripción →')?.click();
    await fixture.whenStable();

    await elegir(fixture, 'adsc-puesto', '8');

    // A management category fixes the pair: there is nothing to choose.
    expect(campo(fixture, 'adsc-tipo-personal')).toBeNull();
    expect(campo(fixture, 'adsc-tipo-jornada')).toBeNull();
    expect(texto(fixture)).toContain('Puesto de mando medio');

    expect(boton(fixture, 'Registrar cambio')?.disabled).toBe(false);
    boton(fixture, 'Registrar cambio')?.click();
    await fixture.whenStable();

    const peticion = httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}/adscripcion`);
    expect(peticion.request.body).toEqual({
      area_id: 3,
      puesto_id: 8,
      tipo_personal: 'No Aplica',
      tipo_jornada: 'Mixta',
      nota: null,
    });

    peticion.flush({ data: ficha() });
    await fixture.whenStable();
  });

  it('resets the working condition when the post changes', async () => {
    const fixture = await abrir();
    await abrirTab(fixture, 'Plaza');

    boton(fixture, 'Registrar cambio de adscripción →')?.click();
    await fixture.whenStable();

    await elegir(fixture, 'adsc-tipo-personal', 'No sindicalizado');
    await elegir(fixture, 'adsc-tipo-jornada', 'Vespertina');

    // A management post takes the condition and hides both controls.
    await elegir(fixture, 'adsc-puesto', '8');
    expect(campo(fixture, 'adsc-tipo-personal')).toBeNull();

    // Going back to an administrative one empties it: it is declared again.
    await elegir(fixture, 'adsc-puesto', '7');
    expect(campo<HTMLSelectElement>(fixture, 'adsc-tipo-personal')?.value).toBe('');
    expect(campo<HTMLSelectElement>(fixture, 'adsc-tipo-jornada')?.value).toBe('');
    expect(boton(fixture, 'Registrar cambio')?.disabled).toBe(true);
  });

  it('corrects the employee number from the header, with explicit confirmation', async () => {
    const fixture = await abrir();

    boton(fixture, 'Corregir número')?.click();
    await fixture.whenStable();

    expect(texto(fixture)).toContain('Anexo al folio US08-17');

    await escribir(fixture, 'num-nuevo', 'utn-9999');
    await escribir(fixture, 'num-motivo', 'El número original fue capturado mal');

    expect(boton(fixture, 'Guardar número')?.disabled).toBe(true);

    await marcar(fixture, '.anexo .check input');

    boton(fixture, 'Guardar número')?.click();
    await fixture.whenStable();

    const peticion = httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}/num-empleado`);
    expect(peticion.request.body).toEqual({
      num_empleado: 'utn-9999',
      motivo_correccion: 'El número original fue capturado mal',
    });
  });

  it('rectifies the identity of the worker from its annex', async () => {
    const fixture = await abrir();

    boton(fixture, 'Rectificar datos de identidad →')?.click();
    await fixture.whenStable();

    await escribir(fixture, 'identidad-nombre', 'Prueba Corregida');
    await escribir(fixture, 'identidad-motivo', 'Corrección del acta de nacimiento');

    boton(fixture, 'Rectificar identidad')?.click();
    await fixture.whenStable();

    const peticion = httpMock.expectOne(`${URL_EMPLEADOS}/${EMPLEADO_ID}/identidad`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual(
      expect.objectContaining({
        nombre: 'Prueba Corregida',
        motivo_rectificacion: 'Corrección del acta de nacimiento',
      }),
    );
  });
});
