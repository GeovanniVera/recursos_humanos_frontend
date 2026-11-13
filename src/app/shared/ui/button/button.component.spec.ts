import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Button } from './button.component';

async function createButton(
  inputs: Record<string, unknown> = {},
): Promise<ComponentFixture<Button>> {
  const fixture = TestBed.createComponent(Button);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

function buttonOf(fixture: ComponentFixture<Button>): HTMLButtonElement {
  const button = (fixture.nativeElement as HTMLElement).querySelector('button');
  if (button === null) {
    throw new Error('No button rendered');
  }
  return button;
}

describe('Button', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Button, ButtonHost, ClickHost],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('is a real button with the primary, medium shape by default', async () => {
    const fixture = await createButton();
    const button = buttonOf(fixture);

    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.classList.contains('is-primary')).toBe(true);
    expect(button.classList.contains('is-md')).toBe(true);
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });

  it('applies the class of every variant', async () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      const fixture = await createButton({ variant });
      expect(buttonOf(fixture).classList.contains(`is-${variant}`)).toBe(true);
      fixture.destroy();
    }
  });

  it('marks the small size', async () => {
    const fixture = await createButton({ size: 'sm' });

    expect(buttonOf(fixture).classList.contains('is-sm')).toBe(true);
  });

  it('submits when asked to', async () => {
    const fixture = await createButton({ type: 'submit' });

    expect(buttonOf(fixture).type).toBe('submit');
  });

  it('is disabled when the input says so', async () => {
    const fixture = await createButton({ disabled: true });

    expect(buttonOf(fixture).disabled).toBe(true);
  });

  it('announces a loading state and stays disabled while it lasts', async () => {
    const fixture = await createButton({ loading: true });
    const button = buttonOf(fixture);

    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
    expect(button.classList.contains('is-loading')).toBe(true);
    expect(button.querySelector('svg.spinner')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the projected label on screen, in Spanish, while loading', async () => {
    const fixture = TestBed.createComponent(ButtonHost);
    await fixture.whenStable();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    // The label is projected, so the component never owns copy — and it stays
    // visible while loading instead of turning into a spinner.
    expect(button?.textContent?.trim()).toBe('Guardando');
    expect(button?.getAttribute('aria-busy')).toBe('true');
  });

  it('forwards a click from its host, so `(click)` works on <app-button>', async () => {
    const fixture = TestBed.createComponent(ClickHost);
    await fixture.whenStable();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    button?.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.clicks).toBe(1);
  });
});

@Component({
  imports: [Button],
  template: '<app-button variant="primary" [loading]="true">Guardando</app-button>',
})
class ButtonHost {}

@Component({
  imports: [Button],
  template: '<app-button variant="secondary" (click)="clicks = clicks + 1">Aplicar</app-button>',
})
class ClickHost {
  clicks = 0;
}
