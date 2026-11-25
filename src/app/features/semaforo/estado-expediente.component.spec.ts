import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EstadoExpediente } from '../../core/semaforo/semaforo.models';
import { ESTADOS_EXPEDIENTE, EstadoExpedienteBadge } from './estado-expediente.component';

/** The three states of a file, with the copy and the tone they must paint. */
const CASES: readonly { estado: EstadoExpediente; copy: string; tone: string }[] = [
  { estado: 'completo', copy: 'Completo', tone: 'is-completo' },
  { estado: 'casi_completo', copy: 'Casi completo', tone: 'is-casi-completo' },
  { estado: 'incompleto', copy: 'Incompleto', tone: 'is-incompleto' },
];

async function createBadge(estado: EstadoExpediente): Promise<ComponentFixture<EstadoExpedienteBadge>> {
  const fixture = TestBed.createComponent(EstadoExpedienteBadge);
  fixture.componentRef.setInput('estado', estado);
  await fixture.whenStable();
  return fixture;
}

function rootOf(fixture: ComponentFixture<EstadoExpedienteBadge>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('EstadoExpedienteBadge', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EstadoExpedienteBadge] }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('keeps the labels of the contract', () => {
    // The map is the public API of the feature: the screens read it too.
    expect(ESTADOS_EXPEDIENTE).toEqual({
      completo: 'Completo',
      casi_completo: 'Casi completo',
      incompleto: 'Incompleto',
    });
  });

  it('renders every state through the shared pill, with its word and its marker', async () => {
    for (const { estado, copy, tone } of CASES) {
      const fixture = await createBadge(estado);
      const root = rootOf(fixture);
      const pill = root.querySelector<HTMLElement>('app-status-pill .pill');

      expect(pill).not.toBeNull();
      expect(pill?.classList.contains(tone)).toBe(true);
      // The word is what carries the state on a grayscale screen.
      expect(pill?.textContent?.trim()).toBe(copy);
      // The drawing belongs to this feature and sits inside the shape the pill owns.
      expect(pill?.querySelectorAll('svg')).toHaveLength(1);

      fixture.destroy();
    }
  });

  it('draws one marker per state', async () => {
    const paths: string[] = [];

    for (const { estado } of CASES) {
      const fixture = await createBadge(estado);
      paths.push(
        rootOf(fixture).querySelector('svg path')?.getAttribute('d') ?? '',
      );
      fixture.destroy();
    }

    // Check, dash, bang: the marker tells the states apart without colour.
    expect(paths).toEqual(['m6 10 3 3 5-6', 'M6 10h8', 'M10 5v6m0 2v2']);
  });
});
