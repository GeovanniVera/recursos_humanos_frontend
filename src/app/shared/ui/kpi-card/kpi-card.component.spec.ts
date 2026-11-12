import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KpiCard, KpiTone } from './kpi-card.component';

/** Builds a card with the three required inputs, then the extras. */
async function createCard(
  inputs: Record<string, unknown> = {},
): Promise<ComponentFixture<KpiCard>> {
  const fixture = TestBed.createComponent(KpiCard);
  fixture.componentRef.setInput('label', 'Empleados activos');
  fixture.componentRef.setInput('value', '10');
  fixture.componentRef.setInput('icon', 'activos');
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

function host(fixture: ComponentFixture<KpiCard>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function cardOf(fixture: ComponentFixture<KpiCard>): HTMLElement {
  const card = host(fixture).querySelector<HTMLElement>('.card');
  if (card === null) {
    throw new Error('No card rendered');
  }
  return card;
}

function flagOf(fixture: ComponentFixture<KpiCard>): HTMLElement {
  const flag = host(fixture).querySelector<HTMLElement>('.flag');
  if (flag === null) {
    throw new Error('No flag rendered');
  }
  return flag;
}

describe('KpiCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [KpiCard] }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('paints the flag with the class of its tone', async () => {
    const tones: readonly KpiTone[] = ['success', 'danger', 'warning'];

    for (const tone of tones) {
      const fixture = await createCard({ tone });
      const flag = flagOf(fixture);

      expect(flag.classList.contains(`is-${tone}`)).toBe(true);
      // One tone only: a card cannot carry two states at once.
      expect(tones.filter((other) => flag.classList.contains(`is-${other}`))).toEqual([tone]);
      fixture.destroy();
    }
  });

  it('keeps the flag and the glyph on the same tone', async () => {
    const fixture = await createCard({ tone: 'danger', icon: 'bajas' });
    const icon = host(fixture).querySelector<HTMLElement>('.icon');

    expect(icon?.classList.contains('is-danger')).toBe(true);
    // Decoration only: the glyph must not be read out.
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(flagOf(fixture).getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the label, the formatted value and the hint', async () => {
    const fixture = await createCard({
      label: 'Expedientes completos',
      value: '1,204',
      hint: '40 % de los activos',
      icon: 'semaforo',
      tone: 'warning',
    });
    const card = cardOf(fixture);

    expect(card.querySelector('.label')?.textContent?.trim()).toBe('Expedientes completos');
    expect(card.querySelector('.value')?.textContent?.trim()).toBe('1,204');
    expect(card.querySelector('.hint')?.textContent?.trim()).toBe('40 % de los activos');
    // The glyph follows the requested icon, not a fixed drawing.
    expect(card.querySelectorAll('svg').length).toBe(1);
  });

  it('omits the hint line when none is given', async () => {
    const fixture = await createCard();

    expect(cardOf(fixture).querySelector('.hint')).toBeNull();
  });

  it('stays a plain box when it leads nowhere', async () => {
    const fixture = await createCard();

    expect(cardOf(fixture).tagName).toBe('DIV');
    expect(host(fixture).querySelector('button')).toBeNull();
    // Nothing to name: the text inside is already the content.
    expect(cardOf(fixture).hasAttribute('aria-label')).toBe(false);
  });

  it('becomes a real button when clickable, named by label and value', async () => {
    const fixture = await createCard({ clickable: true, value: '4' });
    const button = host(fixture).querySelector('button');

    expect(cardOf(fixture).tagName).toBe('BUTTON');
    expect(button?.type).toBe('button');
    // Both parts are in the name, so two cards of the same family differ.
    expect(button?.getAttribute('aria-label')).toBe('Empleados activos: 4');
  });

  it('bubbles the click from the inner button to the host', async () => {
    const fixture = await createCard({ clickable: true });
    let clicks = 0;
    host(fixture).addEventListener('click', () => {
      clicks = clicks + 1;
    });

    host(fixture).querySelector<HTMLButtonElement>('button')?.click();
    await fixture.whenStable();

    expect(clicks).toBe(1);
  });
});
