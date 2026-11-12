import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { EmpleadoDadoDeBaja, MotivoBaja } from '../../../core/empleados/baja.models';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { BajaModal } from './baja-modal.component';

const EMPLEADO_ID = 42;
const URL_MOTIVOS = `${environment.apiBaseUrl}/catalogos/motivos-baja`;
const URL_BAJA = `${environment.apiBaseUrl}/empleados/${EMPLEADO_ID}/baja`;

/** `200` body of the catalog endpoint, straight from the contract. */
const MOTIVOS: readonly MotivoBaja[] = [
  { id: 1, clave: 'BAJA_DEFINITIVA', descripcion: 'Baja definitiva' },
  { id: 4, clave: 'BAJA_TEMPORAL', descripcion: 'Baja temporal' },
];

const BAJA: EmpleadoDadoDeBaja = {
  id: EMPLEADO_ID,
  num_empleado: 'UTN-SEC-01',
  nombre: 'Ana Martínez',
  activo: false,
  fecha_baja: '2026-11-11',
  motivo_baja: 'Baja temporal',
  nota_baja: 'Licencia por incapacidad',
  baja_por: 1,
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
  imports: [BajaModal],
  template: `
    <app-baja-modal
      [empleadoId]="empleadoId()"
      [empleadoEtiqueta]="etiqueta()"
      [(open)]="open"
      (bajaRegistrada)="registradas.push($event)"
    />
  `,
})
class BajaHost {
  readonly empleadoId = signal<number | null>(EMPLEADO_ID);
  readonly etiqueta = signal<string | null>('UTN-SEC-01 — Ana Martínez');
  readonly open = signal(false);
  readonly registradas: EmpleadoDadoDeBaja[] = [];
}

function host(fixture: ComponentFixture<BajaHost>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function dialog(fixture: ComponentFixture<BajaHost>): HTMLDialogElement {
  const element = host(fixture).querySelector<HTMLDialogElement>('dialog');
  if (element === null) {
    throw new Error('No dialog rendered');
  }
  return element;
}

function text(fixture: ComponentFixture<BajaHost>): string {
  return host(fixture).textContent ?? '';
}

/** Native `<button>` of an `app-button`, found by the label it projects. */
function boton(
  fixture: ComponentFixture<BajaHost>,
  etiqueta: string,
): HTMLButtonElement | undefined {
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find((element) =>
    (element.textContent ?? '').includes(etiqueta),
  );
}

/** Chooses an option the way a keyboard or a pointer does: value first, event after. */
function elegir(fixture: ComponentFixture<BajaHost>, motivoId: string): void {
  const select = host(fixture).querySelector<HTMLSelectElement>('#baja-motivo');
  if (select === null) {
    throw new Error('No motive select rendered');
  }
  select.value = motivoId;
  select.dispatchEvent(new Event('change'));
}

/** Types into the note: the value lands first, then the event fires. */
function escribir(fixture: ComponentFixture<BajaHost>, nota: string): void {
  const campo = host(fixture).querySelector<HTMLTextAreaElement>('#baja-nota');
  if (campo === null) {
    throw new Error('No note rendered');
  }
  campo.value = nota;
  campo.dispatchEvent(new Event('input'));
}

describe('BajaModal', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    patchDialogPrototype();
    await TestBed.configureTestingModule({
      imports: [BajaHost],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  /** Mounts the host and opens the layer, which is what starts the catalog read. */
  async function abrir(): Promise<ComponentFixture<BajaHost>> {
    const fixture = TestBed.createComponent(BajaHost);
    await fixture.whenStable();

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    return fixture;
  }

  /** Opens the layer and answers the catalog with the two authorised motives. */
  async function abrirConMotivos(): Promise<ComponentFixture<BajaHost>> {
    const fixture = await abrir();
    httpMock.expectOne(URL_MOTIVOS).flush({ data: MOTIVOS });
    await fixture.whenStable();
    return fixture;
  }

  it('loads the motives when opened and renders them as options', async () => {
    const fixture = await abrir();

    const peticion = httpMock.expectOne(URL_MOTIVOS);
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ data: MOTIVOS });
    await fixture.whenStable();

    const select = host(fixture).querySelector<HTMLSelectElement>('#baja-motivo');
    expect(select).not.toBeNull();

    const opciones = Array.from(select?.options ?? []).map((option) => option.textContent?.trim());
    // The placeholder, then one option per motive, showing the Spanish label.
    expect(opciones).toEqual(['Elegí un motivo', 'Baja definitiva', 'Baja temporal']);
    expect(select?.value).toBe('');

    // The layer names the worker it is about.
    expect(text(fixture)).toContain('UTN-SEC-01 — Ana Martínez');
  });

  it('reads the catalog once: a second open reuses the list', async () => {
    const fixture = await abrirConMotivos();

    fixture.componentInstance.open.set(false);
    await fixture.whenStable();
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    // Nothing was asked again: `httpMock.verify()` would fail on a second read.
    expect(httpMock.match(URL_MOTIVOS).length).toBe(0);
  });

  it('keeps the submit disabled until a motive is chosen and the note is not blank', async () => {
    const fixture = await abrirConMotivos();

    expect(boton(fixture, 'Dar de baja')?.disabled).toBe(true);

    // A note alone is not enough.
    escribir(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();
    expect(boton(fixture, 'Dar de baja')?.disabled).toBe(true);

    // A motive alone is not enough either.
    elegir(fixture, '4');
    await fixture.whenStable();
    escribir(fixture, '');
    await fixture.whenStable();
    expect(boton(fixture, 'Dar de baja')?.disabled).toBe(true);

    // Spaces only are still empty.
    escribir(fixture, '   ');
    await fixture.whenStable();
    expect(boton(fixture, 'Dar de baja')?.disabled).toBe(true);

    escribir(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();
    expect(boton(fixture, 'Dar de baja')?.disabled).toBe(false);
  });

  it('sends the trimmed note with the chosen motive and closes on success', async () => {
    const fixture = await abrirConMotivos();
    const toast = TestBed.inject(ToastService);

    elegir(fixture, '4');
    escribir(fixture, '  Licencia por incapacidad  ');
    await fixture.whenStable();

    // The counter reads what is on screen, not what will be sent.
    expect(text(fixture)).toContain('28 / 1000');

    boton(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    const peticion = httpMock.expectOne(URL_BAJA);
    expect(peticion.request.method).toBe('POST');
    // Only the two fields of the contract, and the note without its edges.
    expect(peticion.request.body).toEqual({ motivo_id: 4, nota: 'Licencia por incapacidad' });
    expect(Object.keys(peticion.request.body as object)).toEqual(['motivo_id', 'nota']);

    peticion.flush({ mensaje: 'Baja procesada exitosamente.', empleado: BAJA });
    await fixture.whenStable();

    expect(fixture.componentInstance.registradas).toEqual([BAJA]);
    expect(fixture.componentInstance.open()).toBe(false);
    expect(dialog(fixture).hasAttribute('open')).toBe(false);

    const avisos = toast.toasts();
    expect(avisos.length).toBe(1);
    expect(avisos[0].type).toBe('success');
    expect(avisos[0].title).toBe('Baja procesada exitosamente.');
    expect(avisos[0].message).toBe('Ana Martínez quedó dado de baja.');
  });

  it('shows the backend sentence of a 409 and keeps the layer open', async () => {
    const fixture = await abrirConMotivos();

    elegir(fixture, '4');
    escribir(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();

    boton(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_BAJA).flush(
      { mensaje: 'El trabajador ya está dado de baja.', codigo: 'trabajador_ya_inactivo' },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(text(fixture)).toContain('El trabajador ya está dado de baja.');
    expect(host(fixture).querySelector('[role="alert"]')).not.toBeNull();

    // Nothing was emitted and the panel is still there: the user has to read why
    // before leaving.
    expect(fixture.componentInstance.registradas).toEqual([]);
    expect(fixture.componentInstance.open()).toBe(true);

    // Retrying cannot change the answer, so the only ways out are the ✕ and the
    // secondary action, which now says what it does.
    expect(boton(fixture, 'Dar de baja')).toBeUndefined();
    expect(boton(fixture, 'Cerrar')).toBeDefined();
    expect(boton(fixture, 'Cancelar')).toBeUndefined();
  });

  it('places the message of a 422 next to the note', async () => {
    const fixture = await abrirConMotivos();

    elegir(fixture, '4');
    escribir(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();

    boton(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_BAJA).flush(
      {
        message: 'Los datos no son válidos.',
        errors: { nota: ['La nota no puede tener más de 1000 caracteres.'] },
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();

    const error = host(fixture).querySelector<HTMLElement>('#error-nota');
    expect(error?.textContent?.trim()).toBe('La nota no puede tener más de 1000 caracteres.');
    expect(error?.getAttribute('role')).toBe('alert');

    const nota = host(fixture).querySelector<HTMLTextAreaElement>('#baja-nota');
    expect(nota?.classList.contains('is-invalid')).toBe(true);
    expect(nota?.getAttribute('aria-describedby')).toBe('baja-nota-contador error-nota');

    // A recognised field explains itself in place: the generic sentence would be
    // a second, vaguer answer to the same problem.
    expect(host(fixture).querySelector('.alert')).toBeNull();
    expect(fixture.componentInstance.open()).toBe(true);
  });

  it('names the missing permission of a 403 with its contract code', async () => {
    const fixture = await abrirConMotivos();

    elegir(fixture, '4');
    escribir(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();

    boton(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_BAJA).flush(
      { codigo: 'permiso_denegado' },
      { status: 403, statusText: 'Forbidden' },
    );
    await fixture.whenStable();

    expect(text(fixture)).toContain('No tenés permisos para dar de baja.');
    expect(fixture.componentInstance.open()).toBe(true);
    expect(fixture.componentInstance.registradas).toEqual([]);
  });

  it('tells a revoked access apart from a missing permission', async () => {
    const fixture = await abrirConMotivos();

    elegir(fixture, '4');
    escribir(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();

    boton(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    // A revoked access destroys the token and answers with no code at all.
    httpMock.expectOne(URL_BAJA).flush(
      { message: 'Unauthenticated.' },
      { status: 403, statusText: 'Forbidden' },
    );
    await fixture.whenStable();

    expect(text(fixture)).toContain('Tu acceso ya no está vigente. Volvé a iniciar sesión.');
    expect(text(fixture)).not.toContain('No tenés permisos para dar de baja.');
  });

  it('blames the connection when the request never reached the server', async () => {
    const fixture = await abrirConMotivos();

    elegir(fixture, '4');
    escribir(fixture, 'Licencia por incapacidad');
    await fixture.whenStable();

    boton(fixture, 'Dar de baja')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_BAJA).error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();

    expect(text(fixture)).toContain('No pudimos conectar con el servidor. Revisá tu conexión.');
    expect(fixture.componentInstance.open()).toBe(true);
  });
});
