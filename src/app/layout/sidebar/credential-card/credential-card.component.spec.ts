import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SidebarCredentialCard } from './credential-card.component';

interface DialogPrototypePatch {
  showModal: () => void;
  close: () => void;
}

/** jsdom has no `showModal`; the card's confirmation is a real `<dialog>`. */
function patchDialogPrototype(): void {
  const proto = HTMLDialogElement.prototype as unknown as DialogPrototypePatch;

  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };

  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

function host(fixture: ComponentFixture<SidebarCredentialCard>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function signOutButton(fixture: ComponentFixture<SidebarCredentialCard>): HTMLButtonElement {
  const button = host(fixture).querySelector<HTMLButtonElement>('.signout');
  if (button === null) {
    throw new Error('No sign-out rendered');
  }
  return button;
}

function dialogOf(fixture: ComponentFixture<SidebarCredentialCard>): HTMLDialogElement {
  const dialog = host(fixture).querySelector<HTMLDialogElement>('dialog');
  if (dialog === null) {
    throw new Error('No confirmation dialog rendered');
  }
  return dialog;
}

function dialogActions(
  fixture: ComponentFixture<SidebarCredentialCard>,
): HTMLButtonElement[] {
  return Array.from(dialogOf(fixture).querySelectorAll<HTMLButtonElement>('button.button'));
}

async function createCard(): Promise<ComponentFixture<SidebarCredentialCard>> {
  const fixture = TestBed.createComponent(SidebarCredentialCard);
  fixture.componentRef.setInput('name', 'Ana Martínez');
  fixture.componentRef.setInput('initials', 'AM');
  fixture.componentRef.setInput('role', 'Secretaría');
  await fixture.whenStable();
  return fixture;
}

describe('SidebarCredentialCard', () => {
  beforeEach(async () => {
    patchDialogPrototype();
    await TestBed.configureTestingModule({ imports: [SidebarCredentialCard] }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('writes the initials, the name and the readable role', async () => {
    const fixture = await createCard();

    expect(host(fixture).querySelector('.avatar')?.textContent?.trim()).toBe('AM');
    expect(host(fixture).querySelector('.name')?.textContent?.trim()).toBe('Ana Martínez');
    expect(host(fixture).querySelector('.role-stamp')?.textContent?.trim()).toBe('Secretaría');
    expect(signOutButton(fixture).textContent).toContain('Cerrar sesión');
  });

  it('emits the sign-out only after the confirmation is accepted', async () => {
    const fixture = await createCard();
    const emitted: number[] = [];
    fixture.componentInstance.signOut.subscribe(() => emitted.push(1));

    signOutButton(fixture).click();
    await fixture.whenStable();

    expect(dialogOf(fixture).hasAttribute('open')).toBe(true);
    expect(dialogOf(fixture).textContent).toContain('Ana Martínez');
    expect(emitted.length).toBe(0);

    // `Cancelar` closes the layer and emits nothing.
    dialogActions(fixture)[0].click();
    await fixture.whenStable();
    expect(dialogOf(fixture).hasAttribute('open')).toBe(false);
    expect(emitted.length).toBe(0);

    // The confirmation button is the single path to the output.
    signOutButton(fixture).click();
    await fixture.whenStable();
    expect(dialogActions(fixture).map((button) => button.textContent?.trim())).toEqual([
      'Cancelar',
      'Cerrar sesión',
    ]);
    dialogActions(fixture)[1].click();
    await fixture.whenStable();

    expect(emitted.length).toBe(1);
    expect(dialogOf(fixture).hasAttribute('open')).toBe(false);
  });

  it('keeps one primary action in the confirmation', async () => {
    const fixture = await createCard();
    signOutButton(fixture).click();
    await fixture.whenStable();

    const primary = dialogOf(fixture).querySelectorAll('.button.is-primary');
    expect(primary.length).toBe(1);
  });

  it('collapses to the avatar and an icon-only exit on the rail', async () => {
    const fixture = TestBed.createComponent(SidebarCredentialCard);
    fixture.componentRef.setInput('initials', 'AM');
    fixture.componentRef.setInput('collapsed', true);
    fixture.componentRef.setInput('tooltipId', 'sidebar-rail-tooltip');
    await fixture.whenStable();

    expect(host(fixture).querySelector('.card')?.classList.contains('is-rail')).toBe(true);
    // The name and the seal leave the rail; the avatar stays.
    expect(host(fixture).querySelector('.name')).toBeNull();
    expect(host(fixture).querySelector('.role-stamp')).toBeNull();
    expect(host(fixture).querySelector('.avatar')?.textContent?.trim()).toBe('AM');

    // The exit survives as an icon-only button, named for every reader.
    const button = signOutButton(fixture);
    expect(button.classList.contains('is-icon')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Cerrar sesión');
    expect(button.getAttribute('data-tooltip-key')).toBe('logout');
    expect(button.getAttribute('aria-describedby')).toBe('sidebar-rail-tooltip');

    button.click();
    await fixture.whenStable();
    expect(dialogOf(fixture).hasAttribute('open')).toBe(true);
  });
});
