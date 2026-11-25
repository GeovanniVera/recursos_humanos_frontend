import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RowFlag, RowFlagTone } from './row-flag.component';

/** Tones the flag accepts, each with the class it must paint. */
const TONES: readonly { tone: RowFlagTone; className: string }[] = [
  { tone: 'completo', className: 'is-completo' },
  { tone: 'casi_completo', className: 'is-casi-completo' },
  { tone: 'incompleto', className: 'is-incompleto' },
  { tone: 'activo', className: 'is-activo' },
  { tone: 'baja', className: 'is-baja' },
];

/** Creates the flag with its two required inputs. */
async function createFlag(tone: RowFlagTone, label: string): Promise<ComponentFixture<RowFlag>> {
  const fixture = TestBed.createComponent(RowFlag);
  fixture.componentRef.setInput('tone', tone);
  fixture.componentRef.setInput('label', label);
  await fixture.whenStable();
  return fixture;
}

function host(fixture: ComponentFixture<RowFlag>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function laneOf(fixture: ComponentFixture<RowFlag>): HTMLElement {
  const lane = host(fixture).querySelector<HTMLElement>('.row-flag');
  if (lane === null) {
    throw new Error('No lane rendered');
  }
  return lane;
}

function labelOf(fixture: ComponentFixture<RowFlag>): HTMLElement {
  const label = host(fixture).querySelector<HTMLElement>('.visually-hidden');
  if (label === null) {
    throw new Error('No label rendered');
  }
  return label;
}

describe('RowFlag', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RowFlag] }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('paints the lane with the class of its tone', async () => {
    for (const { tone, className } of TONES) {
      const fixture = await createFlag(tone, 'Estado: Activo');
      const lane = laneOf(fixture);

      expect(lane.classList.contains(className)).toBe(true);
      // One tone only: a row cannot carry two states at once.
      expect(TONES.filter((other) => lane.classList.contains(other.className))).toEqual([
        { tone, className },
      ]);
      fixture.destroy();
    }
  });

  it('spells the domain tone as a kebab-case class', async () => {
    const fixture = await createFlag('casi_completo', 'Estado del expediente: Casi completo');

    // The underscore belongs to the domain value, not to the CSS naming.
    expect(laneOf(fixture).classList.contains('is-casi-completo')).toBe(true);
    expect(laneOf(fixture).classList.contains('is-casi_completo')).toBe(false);
  });

  it('keeps the sentence in the accessibility tree', async () => {
    const fixture = await createFlag('incompleto', 'Estado del expediente: Incompleto');

    expect(labelOf(fixture).textContent?.trim()).toBe('Estado del expediente: Incompleto');
  });

  it('hides the lane from assistive tech', async () => {
    const fixture = await createFlag('baja', 'Estado: Baja');
    const lane = laneOf(fixture);

    expect(lane.getAttribute('aria-hidden')).toBe('true');
    // The lane must not repeat the state as text: the label is the announcement.
    expect(lane.textContent?.trim()).toBe('');
  });

  it('renders no box of its own inside the cell', async () => {
    const fixture = await createFlag('activo', 'Estado: Activo');
    const element = host(fixture);

    // Both children are siblings and absolute (lane) or visually hidden (label),
    // so the host never contributes in-flow width or height to the cell.
    expect(element.children.length).toBe(2);
    expect(laneOf(fixture).parentElement).toBe(element);
    expect(labelOf(fixture).parentElement).toBe(element);
    // No text node of its own: the only sentence is the one inside the label.
    expect(element.textContent?.trim()).toBe('Estado: Activo');
    expect(
      Array.from(element.childNodes).every((node) => node.nodeType === Node.ELEMENT_NODE),
    ).toBe(true);
  });
});
