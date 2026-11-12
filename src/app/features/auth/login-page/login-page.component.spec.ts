import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginPage } from './login-page.component';

const CORREO = 'persona@utn.edu.mx';

function host(fixture: ComponentFixture<LoginPage>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: ComponentFixture<LoginPage>): string {
  return host(fixture).textContent ?? '';
}

/** Writes the email the way a user would. */
async function writeEmail(fixture: ComponentFixture<LoginPage>, correo: string): Promise<void> {
  const input = host(fixture).querySelector<HTMLInputElement>('input[type="email"]');
  if (input === null) {
    throw new Error('No email field rendered');
  }
  input.value = correo;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
}

/** Submits the form of the current step. */
async function submit(fixture: ComponentFixture<LoginPage>): Promise<void> {
  const form = host(fixture).querySelector('form');
  if (form === null) {
    throw new Error('No form rendered');
  }
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await fixture.whenStable();
}

/** Fills the six code boxes. */
async function writeCode(fixture: ComponentFixture<LoginPage>, codigo: string): Promise<void> {
  const boxes = Array.from(
    host(fixture).querySelectorAll<HTMLInputElement>('app-otp-input input'),
  );
  if (boxes.length !== 6) {
    throw new Error('No code boxes rendered');
  }
  boxes.forEach((box, index) => {
    box.value = codigo[index] ?? '';
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await fixture.whenStable();
}

/** Runs step 1 against a successful backend answer. */
async function goToCodeStep(
  fixture: ComponentFixture<LoginPage>,
  httpMock: HttpTestingController,
): Promise<void> {
  await writeEmail(fixture, CORREO);
  await submit(fixture);
  httpMock
    .expectOne((request) => request.url.endsWith('/auth/otp'))
    .flush({ message: 'Si el correo existe, enviamos un código.' });
  await fixture.whenStable();
}

describe('LoginPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('pins the page to the light theme even when the user picked another one', async () => {
    localStorage.setItem('utn-rh.theme', 'guinda');
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();

    // The host carries the attribute, so the whole subtree resolves light
    // tokens regardless of the document root.
    expect(host(fixture).getAttribute('data-theme')).toBe('light');
  });

  it('starts on the email step', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();

    expect(text(fixture)).toContain('Bienvenido');
    expect(text(fixture)).toContain('CORREO INSTITUCIONAL');
    expect(text(fixture)).not.toContain('Revisa tu correo');
  });

  it('requests the code by email and moves to the code step', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();

    await writeEmail(fixture, `  ${CORREO}  `);
    await submit(fixture);

    const request = httpMock.expectOne((candidate) => candidate.url.endsWith('/auth/otp'));
    expect(request.request.method).toBe('POST');
    // The email is trimmed before it leaves the browser.
    expect(request.request.body).toEqual({ correo: CORREO });
    request.flush({ message: 'Si el correo existe, enviamos un código.' });
    await fixture.whenStable();

    expect(text(fixture)).toContain('Revisa tu correo');
    expect(text(fixture)).toContain(CORREO);
    expect(text(fixture)).toContain('Reenviar código en 00:30');
  });

  it('shows the backend message and stays on the code step on a 422', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    await goToCodeStep(fixture, httpMock);

    await writeCode(fixture, '123456');
    await submit(fixture);

    const request = httpMock.expectOne((candidate) =>
      candidate.url.endsWith('/auth/otp/verificar'),
    );
    expect(request.request.body).toEqual({ correo: CORREO, codigo: '123456' });
    request.flush(
      { message: 'El código no es correcto.', intentos_restantes: 2 },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();

    expect(text(fixture)).toContain('El código no es correcto.');
    expect(text(fixture)).toContain('Intentos restantes: 2.');
    expect(text(fixture)).toContain('Revisa tu correo');
    expect(host(fixture).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('keeps the email when going back to the first step', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    await goToCodeStep(fixture, httpMock);

    const back = Array.from(host(fixture).querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('Cambiar correo'),
    );
    expect(back).toBeDefined();
    back?.click();
    await fixture.whenStable();

    expect(text(fixture)).toContain('Bienvenido');
    expect(text(fixture)).not.toContain('Revisa tu correo');
    const input = host(fixture).querySelector<HTMLInputElement>('input[type="email"]');
    expect(input?.value).toBe(CORREO);
    // The countdown is gone with the step.
    expect(text(fixture)).not.toContain('Reenviar código en');
  });

  it('shows the client copy when the backend cannot be reached', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();

    await writeEmail(fixture, CORREO);
    await submit(fixture);

    httpMock
      .expectOne((candidate) => candidate.url.endsWith('/auth/otp'))
      .error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();

    expect(text(fixture)).toContain('No pudimos conectar con el servidor.');
    expect(text(fixture)).toContain('Bienvenido');
  });
});
