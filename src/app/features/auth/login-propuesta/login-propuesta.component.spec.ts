import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginPropuesta } from './login-propuesta.component';

const CORREO = 'persona@utn.edu.mx';

function host(fixture: ComponentFixture<LoginPropuesta>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: ComponentFixture<LoginPropuesta>): string {
  return host(fixture).textContent ?? '';
}

async function writeEmail(fixture: ComponentFixture<LoginPropuesta>, correo: string): Promise<void> {
  const input = host(fixture).querySelector<HTMLInputElement>('input[type="email"]');
  if (input === null) {
    throw new Error('No email field rendered');
  }
  input.value = correo;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
}

async function submit(fixture: ComponentFixture<LoginPropuesta>): Promise<void> {
  const form = host(fixture).querySelector('form');
  if (form === null) {
    throw new Error('No form rendered');
  }
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await fixture.whenStable();
}

describe('LoginPropuesta', () => {
  let fixture: ComponentFixture<LoginPropuesta>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPropuesta],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPropuesta);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders step 1 with the brand headline and instructions', () => {
    expect(text(fixture)).toContain('Sistema de');
    expect(text(fixture)).toContain('Recursos Humanos');
    expect(text(fixture)).toContain('Bienvenido');
    expect(text(fixture)).toContain('CORREO INSTITUCIONAL');
  });

  it('disables the submit button until an email is entered', async () => {
    const button = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(button?.disabled).toBe(true);

    await writeEmail(fixture, CORREO);
    fixture.detectChanges();

    expect(button?.disabled).toBe(false);
  });

  it('advances to step 2 on a successful OTP request', async () => {
    await writeEmail(fixture, CORREO);
    fixture.detectChanges();
    await submit(fixture);

    const req = httpMock.expectOne('http://localhost:8080/api/auth/otp');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ correo: CORREO });
    req.flush({ status: 'ok' });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(text(fixture)).toContain('Revisa tu correo');
    expect(text(fixture)).toContain(CORREO);
  });
});
