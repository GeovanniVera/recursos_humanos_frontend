import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RowLink } from './row-link.component';

/** Caller that projects the word and listens to the activation, as a table does. */
@Component({
  selector: 'app-row-link-host',
  imports: [RowLink],
  template: `<app-row-link [ariaLabel]="label()" (click)="activaciones = activaciones + 1">
    Ana Prueba
  </app-row-link>`,
})
class LinkHost {
  readonly label = signal<string | null>('Ver la ficha de Ana Prueba');
  activaciones = 0;
}

function rootOf(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function buttonIn(root: HTMLElement): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>('button');
  if (button === null) {
    throw new Error('No button rendered');
  }
  return button;
}

async function createLink(): Promise<ComponentFixture<RowLink>> {
  const fixture = TestBed.createComponent(RowLink);
  await fixture.whenStable();
  return fixture;
}

async function createHost(): Promise<ComponentFixture<LinkHost>> {
  const fixture = TestBed.createComponent(LinkHost);
  await fixture.whenStable();
  return fixture;
}

describe('RowLink', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RowLink, LinkHost] }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders a real button with the projected word inside', async () => {
    const fixture = await createHost();
    const host = rootOf(fixture).querySelector<HTMLElement>('app-row-link');
    const button = host?.querySelector<HTMLButtonElement>('button');

    expect(button?.tagName).toBe('BUTTON');
    expect(button?.textContent?.trim()).toBe('Ana Prueba');
    // The host is a slot, not a second control: no role, no tab stop, no name.
    expect(host?.getAttribute('role')).toBeNull();
    expect(host?.getAttribute('tabindex')).toBeNull();
    expect(host?.getAttribute('aria-label')).toBeNull();
  });

  it('exposes the label on the control that carries it', async () => {
    const fixture = await createHost();

    expect(buttonIn(rootOf(fixture)).getAttribute('aria-label')).toBe(
      'Ver la ficha de Ana Prueba',
    );
  });

  it('omits the label when the caller passes none', async () => {
    const fixture = await createLink();

    // The projected word is the whole name, so no second sentence is invented.
    expect(buttonIn(rootOf(fixture)).hasAttribute('aria-label')).toBe(false);
  });

  it('keeps the activation on the platform', async () => {
    const fixture = await createHost();
    const button = buttonIn(rootOf(fixture));

    // A `type="button"` in the tab order is activated by Enter and Space by the
    // platform itself: the component adds no key handler of its own.
    expect(button.getAttribute('type')).toBe('button');
    expect(button.tabIndex).toBe(0);
    expect(button.disabled).toBe(false);

    button.click();
    await fixture.whenStable();

    // The click bubbles to the caller, which is how a row stays the pointer
    // shortcut and the button stays the keyboard path.
    expect(fixture.componentInstance.activaciones).toBe(1);
  });

  it('stays inline so the cell keeps its line of text', async () => {
    const fixture = await createLink();

    // A block or flex host would take a line of its own inside the cell and
    // change the height of the row it belongs to.
    expect(getComputedStyle(rootOf(fixture)).display).toBe('inline');
    expect(rootOf(fixture).style.display).toBe('');
  });
});
