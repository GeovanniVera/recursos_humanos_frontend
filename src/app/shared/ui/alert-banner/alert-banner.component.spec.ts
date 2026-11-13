import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Button } from '../button/button.component';
import { AlertBanner, AlertRole, AlertVariant } from './alert-banner.component';

@Component({
  imports: [AlertBanner, Button],
  template: `
    <app-alert-banner
      [variant]="variant()"
      [role]="role()"
      [title]="title()"
      [message]="message()"
      [code]="code()"
      [detail]="detail()"
    >
      @if (extra()) {
        <p class="extra">{{ extra() }}</p>
      }
      @if (showAction()) {
        <app-button alert-actions variant="secondary">Reintentar</app-button>
      }
    </app-alert-banner>
  `,
})
class AlertHost {
  readonly variant = signal<AlertVariant>('error');
  readonly role = signal<AlertRole | null>(null);
  readonly title = signal<string | null>('Error de carga');
  readonly message = signal<string | null>('No pudimos conectar con el servidor.');
  readonly code = signal<string | null>(null);
  readonly detail = signal<string | null>(null);
  readonly extra = signal<string | null>(null);
  readonly showAction = signal(false);
}

describe('AlertBanner', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlertHost],
    }).compileComponents();
  });

  it('defaults ARIA roles by variant (alert for error/warning, status for info/success)', () => {
    const fixture = TestBed.createComponent(AlertHost);
    fixture.detectChanges();

    const banner = () => fixture.nativeElement.querySelector('.alert') as HTMLElement;
    expect(banner().getAttribute('role')).toBe('alert');
    expect(banner().classList.contains('is-error')).toBe(true);

    fixture.componentInstance.variant.set('warning');
    fixture.detectChanges();
    expect(banner().getAttribute('role')).toBe('alert');
    expect(banner().classList.contains('is-warning')).toBe(true);

    fixture.componentInstance.variant.set('info');
    fixture.detectChanges();
    expect(banner().getAttribute('role')).toBe('status');
    expect(banner().classList.contains('is-info')).toBe(true);

    fixture.componentInstance.variant.set('success');
    fixture.detectChanges();
    expect(banner().getAttribute('role')).toBe('status');
    expect(banner().classList.contains('is-success')).toBe(true);
  });

  it('respects an explicit role override and renders title, message, code and detail', () => {
    const fixture = TestBed.createComponent(AlertHost);
    fixture.componentInstance.variant.set('info');
    fixture.componentInstance.role.set('alert');
    fixture.componentInstance.code.set('HTTP_503');
    fixture.componentInstance.detail.set('detalle_contrato');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.alert')?.getAttribute('role')).toBe('alert');
    expect(el.querySelector('.alert-title')?.textContent?.trim()).toBe('Error de carga');
    expect(el.querySelector('.alert-message')?.textContent?.trim()).toBe(
      'No pudimos conectar con el servidor.',
    );
    expect(el.querySelector('.alert-code')?.textContent?.trim()).toBe('HTTP_503');
    expect(el.querySelector('.alert-detail')?.textContent?.trim()).toBe('detalle_contrato');
  });

  it('projects extra body lines and alert-actions buttons cleanly', () => {
    const fixture = TestBed.createComponent(AlertHost);
    fixture.componentInstance.extra.set('Campo adicional inválido');
    fixture.componentInstance.showAction.set(true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.alert-copy .extra')?.textContent?.trim()).toBe(
      'Campo adicional inválido',
    );
    expect(el.querySelector('.alert app-button button')?.textContent?.trim()).toBe('Reintentar');
  });
});
