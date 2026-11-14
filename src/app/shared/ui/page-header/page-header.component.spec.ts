import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageHeader } from './page-header.component';

/** A page that gives the header all three inputs and projects an action. */
@Component({
  imports: [PageHeader],
  template: `
    <app-page-header
      eyebrow="Expedientes · Recursos Humanos"
      title="Semáforo de Completitud"
      subtitle="Identifica la información pendiente de cada expediente."
    >
      <a class="back" href="/">Volver al panel</a>
    </app-page-header>
  `,
})
class HostWithAction {}

/** A page with no subtitle and no action, the smallest use of the header. */
@Component({
  imports: [PageHeader],
  template: `<app-page-header eyebrow="Recursos Humanos" title="Ajustes" />`,
})
class HostBare {}

function hostOf<T>(type: new () => T): HTMLElement {
  const fixture = TestBed.createComponent(type);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PageHeader', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostWithAction, HostBare],
    }).compileComponents();
  });

  it('renders the overline, the title and the subtitle', () => {
    const element = hostOf(HostWithAction);

    expect(element.querySelector('.eyebrow')?.textContent?.trim()).toBe(
      'Expedientes · Recursos Humanos',
    );
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Semáforo de Completitud');
    expect(element.querySelector('.subtitle')?.textContent?.trim()).toBe(
      'Identifica la información pendiente de cada expediente.',
    );
  });

  it('exposes a single h1, and it is the title', () => {
    const element = hostOf(HostWithAction);

    const headings = Array.from(element.querySelectorAll('h1'));
    expect(headings).toHaveLength(1);
    expect(headings[0].classList.contains('title')).toBe(true);
    // The overline is a label, not a heading: the outline of the page has one step.
    expect(element.querySelectorAll('h2, h3')).toHaveLength(0);
  });

  it('projects the trailing action inside the head, outside the title block', () => {
    const element = hostOf(HostWithAction);

    const action = element.querySelector<HTMLAnchorElement>('.head .back');
    expect(action?.textContent?.trim()).toBe('Volver al panel');
    expect(action?.getAttribute('href')).toBe('/');
    // It is the action slot's child, not part of the identity block.
    expect(element.querySelector('.identity .back')).toBeNull();
  });

  it('omits the subtitle when the screen has none', () => {
    const element = hostOf(HostBare);

    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Ajustes');
    expect(element.querySelector('.subtitle')).toBeNull();
  });
});
