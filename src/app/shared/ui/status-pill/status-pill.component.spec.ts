import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusPill, StatusPillTone } from './status-pill.component';

/** Every tone the pill accepts, with the class it must paint. */
const TONES: readonly { tone: StatusPillTone; className: string }[] = [
  { tone: 'completo', className: 'is-completo' },
  { tone: 'casi_completo', className: 'is-casi-completo' },
  { tone: 'incompleto', className: 'is-incompleto' },
  { tone: 'activo', className: 'is-activo' },
  { tone: 'baja', className: 'is-baja' },
];

/** Caller that projects the word and the marker, the way a feature does. */
@Component({
  selector: 'app-status-pill-host',
  imports: [StatusPill],
  template: `
    <app-status-pill [estado]="tone()">
      <svg class="marker" viewBox="0 0 20 20" aria-hidden="true"></svg>
      {{ label() }}
    </app-status-pill>
  `,
})
class PillHost {
  readonly tone = signal<StatusPillTone>('casi_completo');
  readonly label = signal('Casi completo');
}

async function createPill(tone: StatusPillTone): Promise<ComponentFixture<StatusPill>> {
  const fixture = TestBed.createComponent(StatusPill);
  fixture.componentRef.setInput('estado', tone);
  await fixture.whenStable();
  return fixture;
}

function pillOf(fixture: ComponentFixture<StatusPill>): HTMLElement {
  const pill = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.pill');
  if (pill === null) {
    throw new Error('No pill rendered');
  }
  return pill;
}

/**
 * Text of the stylesheets this component ships.
 *
 * The component opts out of emulated encapsulation, so its rules reach the
 * document as a single block; filtering by the element selector keeps the
 * assertions away from any other stylesheet of the suite.
 */
function shippedStyles(): string {
  return Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .filter((text) => text.includes('app-status-pill'))
    .join('\n');
}

/**
 * Declarations of one rule of the component stylesheet.
 *
 * jsdom cannot resolve `var(--…)`, so a token never comes back from a computed
 * style; the recipe is asserted on the stylesheet the component ships instead.
 */
function declarationsOf(selector: string): string {
  const rule = new RegExp(`${selector.replaceAll('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(
    shippedStyles(),
  );
  if (rule === null) {
    throw new Error(`No rule for ${selector}`);
  }
  return rule[1];
}

describe('StatusPill', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StatusPill, PillHost] }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('paints the tone of the state with one class only', async () => {
    for (const { tone, className } of TONES) {
      const fixture = await createPill(tone);
      const pill = pillOf(fixture);

      expect(pill.classList.contains(className)).toBe(true);
      expect(pill.classList.contains('pill')).toBe(true);
      // One tone only: a record cannot report two states at once.
      expect(TONES.filter((other) => pill.classList.contains(other.className))).toEqual([
        { tone, className },
      ]);
      fixture.destroy();
    }
  });

  it('spells the domain value as a kebab-case class', async () => {
    const fixture = await createPill('casi_completo');

    // The underscore belongs to the backend value, not to the CSS naming.
    expect(pillOf(fixture).classList.contains('is-casi-completo')).toBe(true);
    expect(pillOf(fixture).classList.contains('is-casi_completo')).toBe(false);
  });

  it('outlines the casi_completo tone with the warning token', async () => {
    const fixture = await createPill('casi_completo');
    const declarations = declarationsOf('.pill.is-casi-completo');

    // The contrast fix, stated as a recipe: glass fill, primary ink and the
    // yellow marker on the border. jsdom cannot resolve the tokens, so the
    // stylesheet is the evidence.
    expect(declarations).toMatch(/background:\s*var\(--color-surface-glass\)/);
    expect(declarations).toMatch(/color:\s*var\(--color-text-primary\)/);
    expect(declarations).toMatch(/border-color:\s*var\(--color-state-warning\)/);
    expect(pillOf(fixture).classList.contains('is-casi-completo')).toBe(true);
  });

  it('retires the solid warning fill', () => {
    // The fill the outlined variant replaced measured 4.24:1 with white ink.
    const css = shippedStyles();

    expect(css).not.toMatch(/background:\s*var\(--color-state-warning\)/);
    expect(css).not.toMatch(/var\(--color-state-warning-ink\)/);
  });

  it('renders the projected word and marker inside the pill', async () => {
    const fixture = TestBed.createComponent(PillHost);
    await fixture.whenStable();

    const host = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('app-status-pill');
    const pill = host?.querySelector<HTMLElement>('.pill');
    const marker = pill?.querySelector<SVGElement>('svg.marker');

    // The caller's own markup has to end up inside the shape, not beside it.
    expect(pill).not.toBeNull();
    expect(marker).not.toBeNull();
    expect(marker?.parentElement).toBe(pill);
    expect(pill?.textContent?.trim()).toBe('Casi completo');
  });

  it('sizes the projected marker from the shared rule', async () => {
    const fixture = TestBed.createComponent(PillHost);
    await fixture.whenStable();

    const marker = (fixture.nativeElement as HTMLElement).querySelector<SVGElement>('svg.marker');
    const pill = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.pill');

    // The icon belongs to the caller's template, so this proves the shared
    // stylesheet still reaches it: `flex: none` comes from the pill alone.
    expect(pill).not.toBeNull();
    expect(getComputedStyle(marker as SVGElement).flex).toBe('0 0 auto');
  });
});
