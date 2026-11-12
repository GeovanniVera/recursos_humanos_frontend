import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ThemeService } from '../../core/theme/theme.service';
import { AjustesPage } from './ajustes-page.component';

function host(fixture: ComponentFixture<AjustesPage>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/** The three theme cards, in the order the service presents them. */
function options(fixture: ComponentFixture<AjustesPage>): HTMLButtonElement[] {
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button.option'));
}

/** Finds the card of a theme id through the mono label it shows. */
function optionOf(fixture: ComponentFixture<AjustesPage>, id: string): HTMLButtonElement {
  const found = options(fixture).find(
    (option) => option.querySelector('.option-id')?.textContent?.trim() === id,
  );
  if (found === undefined) {
    throw new Error(`No card rendered for the theme ${id}`);
  }
  return found;
}

async function createPage(): Promise<ComponentFixture<AjustesPage>> {
  const fixture = TestBed.createComponent(AjustesPage);
  await fixture.whenStable();
  return fixture;
}

describe('AjustesPage', () => {
  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'light');
    await TestBed.configureTestingModule({
      imports: [AjustesPage],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('offers one card per theme of the service', async () => {
    const fixture = await createPage();

    expect(options(fixture).length).toBe(3);
    expect(options(fixture).map((option) => option.querySelector('.option-id')?.textContent)).toEqual(
      ['guinda', 'light', 'dark'],
    );
    expect(host(fixture).textContent).toContain('Tema de la interfaz');
    expect(host(fixture).querySelector('fieldset legend')?.textContent).toContain(
      'Tema de la interfaz',
    );
  });

  it('marks the default theme as the only pressed card', async () => {
    const fixture = await createPage();

    expect(TestBed.inject(ThemeService).theme()).toBe('light');
    expect(optionOf(fixture, 'light').getAttribute('aria-pressed')).toBe('true');
    expect(optionOf(fixture, 'guinda').getAttribute('aria-pressed')).toBe('false');
    expect(optionOf(fixture, 'dark').getAttribute('aria-pressed')).toBe('false');
  });

  it('applies the pressed theme to the document root', async () => {
    const fixture = await createPage();

    optionOf(fixture, 'dark').click();
    await fixture.whenStable();
    TestBed.tick();

    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(optionOf(fixture, 'dark').getAttribute('aria-pressed')).toBe('true');
    // Selection is exclusive: the previous theme is no longer pressed.
    expect(optionOf(fixture, 'light').getAttribute('aria-pressed')).toBe('false');
    expect(host(fixture).textContent).toContain('Tema activo: Oscuro');
  });
});
