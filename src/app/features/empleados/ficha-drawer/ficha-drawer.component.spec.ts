import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { FichaEmpleado } from '../../../core/empleados/ficha.models';
import { FichaDrawer } from './ficha-drawer.component';

const EMPLEADO_ID = 12;
const URL_FICHA = `${environment.apiBaseUrl}/empleados/${EMPLEADO_ID}`;
const URL_MOTIVOS = `${environment.apiBaseUrl}/catalogos/motivos-baja`;

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

interface DialogPrototypePatch {
  showModal: () => void;
  close: () => void;
}

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
  template: `<app-ficha-drawer [empleadoId]="empleadoId()" [(open)]="open" />`,
})
class FichaHost {
  readonly empleadoId = signal<number | null>(EMPLEADO_ID);
  readonly open = signal(false);
}

function host(fixture: ComponentFixture<FichaHost>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: ComponentFixture<FichaHost>): string {
  return host(fixture).textContent ?? '';
}

/** Headings of the six blocks, in the order the panel presents them. */
function headings(fixture: ComponentFixture<FichaHost>): string[] {
  return Array.from(host(fixture).querySelectorAll('h3')).map(
    (heading) => heading.textContent?.trim() ?? '',
  );
}

/** Value printed under a label of the record, found by the label the user reads. */
function valueOf(fixture: ComponentFixture<FichaHost>, label: string): string | undefined {
  const terms = Array.from(host(fixture).querySelectorAll('dt'));
  const term = terms.find((element) => element.textContent?.trim() === label);
  return term?.nextElementSibling?.textContent?.trim();
}

/**
 * The termination action of the footer.
 *
 * Its label changes with the state of the worker, so both spellings are matched:
 * a test that only looked for `Dar de baja` would silently skip the disabled
 * case it was written to prove.
 */
function botonBaja(fixture: ComponentFixture<FichaHost>): HTMLButtonElement | undefined {
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
    (button) =>
      (button.textContent ?? '').includes('Dar de baja') ||
      (button.textContent ?? '').includes('Ya está dado de baja'),
  );
}

describe('FichaDrawer', () => {
  let httpMock: HttpTestingController;

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
  async function open(): Promise<ComponentFixture<FichaHost>> {
    const fixture = TestBed.createComponent(FichaHost);
    await fixture.whenStable();

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    return fixture;
  }

  it('loads the record and renders the six blocks with its name', async () => {
    const fixture = await open();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    expect(headings(fixture)).toEqual([
      'Identificación',
      'Plaza',
      'Contacto',
      'Estudios',
      'Experiencia',
      'Gestión interna',
    ]);
    expect(text(fixture)).toContain('Nombre Apellido');
    expect(text(fixture)).toContain('UTN-001');
    // The backend sentence of the tenure is displayed, not recomposed.
    expect(text(fixture)).toContain('7 años, 4 meses');
  });

  it('states the subject of the document in its masthead', async () => {
    const fixture = await open();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    const head = host(fixture).querySelector<HTMLElement>('.document-head');
    expect(head).not.toBeNull();

    // The name and the number are repeated in `Identificación` on purpose, but
    // the document has to state who it is about before any sheet does.
    expect(head?.querySelector('.document-name')?.textContent?.trim()).toBe('Nombre Apellido');
    expect(head?.querySelector('.document-number')?.textContent?.trim()).toBe('N.º UTN-001');
    expect(head?.querySelector('.document-area')?.textContent?.trim()).toBe('Área A');

    // Both states are stated once, at the top, by the shared pill: who the
    // worker is and whether the file can be used.
    const pills = head?.querySelectorAll<HTMLElement>('app-status-pill');
    expect(pills).toHaveLength(2);
    expect(pills?.[0].textContent?.trim()).toBe('Activo');
    expect(pills?.[0].querySelector('.pill')?.classList.contains('is-activo')).toBe(true);
    expect(pills?.[1].textContent?.trim()).toBe('Casi completo');
    expect(pills?.[1].querySelector('.pill')?.classList.contains('is-casi-completo')).toBe(true);
  });

  it('wraps every field in a row and marks the two emphasis rows', async () => {
    const fixture = await open();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    const rows = Array.from(host(fixture).querySelectorAll('.pair'));
    const terms = Array.from(host(fixture).querySelectorAll('dt'));

    // A pair left outside the wrapper would lose its zebra and its place in the
    // grid, so the count of rows is the count of labels.
    expect(rows.length).toBe(terms.length);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row.querySelectorAll('dt').length).toBe(1);
      expect(row.querySelectorAll('.pair-value').length).toBe(1);
    }

    const emphasis = Array.from(host(fixture).querySelectorAll('.pair.is-emphasis')).map(
      (row) => row.querySelector('dt')?.textContent?.trim() ?? '',
    );
    expect(emphasis).toEqual(['Antigüedad', 'Estado del expediente']);
  });

  it('prints the placeholder for an empty value and never the word null', async () => {
    const fixture = await open();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    // A missing CURP and a missing `trabaja_otro_donde` read as "not registered".
    expect(valueOf(fixture, 'CURP')).toBe('—');
    expect(valueOf(fixture, 'Dónde')).toBe('—');

    const values = Array.from(host(fixture).querySelectorAll<HTMLElement>('.pair-value')).map(
      (value) => value.textContent?.trim() ?? '',
    );
    expect(values).toContain('—');
    expect(text(fixture)).not.toContain('null');
    expect(text(fixture)).not.toContain('undefined');
  });

  it('formats a YYYY-MM-DD date without moving the day', async () => {
    const fixture = await open();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    // `1990-05-14` is a calendar day, not an instant: read in a zone west of
    // UTC, a local formatter would print the 13th.
    expect(valueOf(fixture, 'Fecha de nacimiento')).toBe('14 de mayo de 1990');
    expect(text(fixture)).not.toContain('13 de mayo de 1990');
  });

  it('reads a baja record with its date, its reason and its note', async () => {
    const fixture = await open();

    const baja: FichaEmpleado = {
      ...FICHA,
      gestion_interna: {
        ...FICHA.gestion_interna,
        activo: false,
        fecha_baja: '2024-02-29',
        motivo_baja: 'Renuncia',
        nota_baja: 'Entregó el expediente',
      },
    };

    httpMock.expectOne(URL_FICHA).flush({ data: baja });
    await fixture.whenStable();

    expect(valueOf(fixture, 'Estado')).toBe('Baja');
    expect(valueOf(fixture, 'Fecha de baja')).toBe('29 de febrero de 2024');
    expect(valueOf(fixture, 'Motivo de baja')).toBe('Renuncia');
    expect(valueOf(fixture, 'Nota de baja')).toBe('Entregó el expediente');

    // The masthead states the same fact with the pill of the system, on the
    // tone of a termination.
    const pill = host(fixture).querySelector<HTMLElement>('.document-states app-status-pill .pill');
    expect(pill?.textContent?.trim()).toBe('Baja');
    expect(pill?.classList.contains('is-baja')).toBe(true);
  });

  it('explains a 404 with its own sentence', async () => {
    const fixture = await open();

    httpMock
      .expectOne(URL_FICHA)
      .flush({ message: 'Trabajador no encontrado.' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    const alert = host(fixture).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('No encontramos ese trabajador.');
    // Nothing to retry: the same id will not exist on the next attempt.
    expect(host(fixture).querySelector('.alert app-button')).toBeNull();
  });

  it('shows the file state as a pill and lists the missing fields', async () => {
    const fixture = await open();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    const pills = host(fixture).querySelectorAll<HTMLElement>('.document-states app-status-pill .pill');
    const pill = pills[1];
    expect(pill?.textContent?.trim()).toBe('Casi completo');
    expect(pill?.classList.contains('is-casi-completo')).toBe(true);

    const missing = host(fixture).querySelector<HTMLElement>('.missing');
    expect(missing?.textContent).toContain('Faltan 2 campos');
    expect(missing?.textContent).toContain('CURP');
    expect(missing?.textContent).toContain('Municipio');
  });

  it('asks for the record again when the panel is reopened', async () => {
    const fixture = await open();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();
    expect(text(fixture)).toContain('Nombre Apellido');

    // Closed, stale data stays for the 300ms exit transition and leaves once finished.
    vi.useFakeTimers();
    try {
      fixture.componentInstance.open.set(false);
      fixture.detectChanges();
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      expect(text(fixture)).not.toContain('Nombre Apellido');
    } finally {
      vi.useRealTimers();
    }

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    expect(text(fixture)).toContain('Nombre Apellido');
  });

  it('enables Dar de baja for an active worker and blocks it for an inactive one', async () => {
    const fixture = await open();
    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    const editar = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.getAttribute('aria-label') === 'Editar la ficha',
    );
    // Without an edit contract wired via `puedeEditar`, the edit button is not shown.
    expect(editar).toBeUndefined();

    const activo = botonBaja(fixture);
    expect(activo?.textContent?.trim()).toBe('Dar de baja');
    expect(activo?.disabled).toBe(false);

    // The same panel, reopened for a worker that is already terminated.
    fixture.componentInstance.open.set(false);
    await fixture.whenStable();
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    httpMock.expectOne(URL_FICHA).flush({
      data: {
        ...FICHA,
        gestion_interna: {
          ...FICHA.gestion_interna,
          activo: false,
          fecha_baja: '2024-02-29',
          motivo_baja: 'Renuncia',
          nota_baja: 'Entregó el expediente',
        },
      },
    });
    await fixture.whenStable();

    const inactivo = botonBaja(fixture);
    // The state is visible in the label, not only in the disabled attribute: a
    // grey pill with no reason reads as a bug.
    expect(inactivo?.textContent?.trim()).toBe('Ya está dado de baja');
    expect(inactivo?.disabled).toBe(true);

    // The way out still works, or the panel would be a trap.
    const cerrar = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => (button.textContent ?? '').includes('Cerrar'),
    );
    expect(cerrar?.disabled).toBe(false);
  });

  it('opens the termination layer as a sibling of the drawer', async () => {
    const fixture = await open();
    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    botonBaja(fixture)?.click();
    await fixture.whenStable();

    const modal = host(fixture).querySelector<HTMLDialogElement>('app-baja-modal dialog');
    expect(modal?.hasAttribute('open')).toBe(true);

    // Two dialogs nested in each other fight for the top layer and the focus
    // trap, so the layer may not live inside the panel.
    expect(host(fixture).querySelector('app-drawer app-baja-modal')).toBeNull();

    // The subject is named from the record the panel already holds.
    expect(modal?.textContent).toContain('UTN-001 — Nombre Apellido');

    httpMock.expectOne(URL_MOTIVOS).flush({ data: [] });
    await fixture.whenStable();
  });

  it('does not open the termination layer for an inactive worker', async () => {
    const fixture = await open();

    httpMock.expectOne(URL_FICHA).flush({
      data: {
        ...FICHA,
        gestion_interna: { ...FICHA.gestion_interna, activo: false, fecha_baja: '2024-02-29' },
      },
    });
    await fixture.whenStable();

    botonBaja(fixture)?.click();
    await fixture.whenStable();

    const modal = host(fixture).querySelector<HTMLDialogElement>('app-baja-modal dialog');
    expect(modal?.hasAttribute('open')).toBe(false);
  });

  it('collapses every section but the first, and each one opens on its own', async () => {
    const fixture = await open();
    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    const blocks = Array.from(
      host(fixture).querySelectorAll<HTMLDetailsElement>('details.block'),
    );

    // Native `<details>` is the control: if a block goes back to `<section>` the
    // record silently loses its ability to fold.
    expect(blocks.length).toBe(6);
    expect(blocks.filter((block) => block.open).length).toBe(1);
    expect(blocks[0].open).toBe(true);

    // Every summary carries its own heading, which is what names the control.
    expect(blocks.every((block) => block.querySelector('summary h3') !== null)).toBe(true);

    // Sections are independent: opening a second one leaves the first alone.
    blocks[3].open = true;

    expect(blocks.filter((block) => block.open).length).toBe(2);
  });

  it('shows the contract code of a permission failure and hides the retry', async () => {
    const fixture = await open();

    httpMock
      .expectOne(URL_FICHA)
      .flush({ codigo: 'permiso_denegado' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();

    expect(text(fixture)).toContain('No tienes permisos para ver esta ficha.');
    expect(text(fixture)).toContain('permiso_denegado');
    expect(host(fixture).querySelector('.alert app-button')).toBeNull();
  });

  it('offers a retry when the server cannot be reached, and the retry asks again', async () => {
    const fixture = await open();

    httpMock.expectOne(URL_FICHA).error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();

    expect(text(fixture)).toContain('No pudimos conectar con el servidor. Revisa tu conexión.');

    const retry = host(fixture).querySelector<HTMLButtonElement>('.alert button');
    retry?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    expect(text(fixture)).toContain('Nombre Apellido');
  });

  it('closes from the action of the footer', async () => {
    const fixture = await open();

    httpMock.expectOne(URL_FICHA).flush({ data: FICHA });
    await fixture.whenStable();

    const close = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => (button.textContent ?? '').includes('Cerrar'),
    );
    expect(close).toBeDefined();

    close?.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.open()).toBe(false);
  });
});
