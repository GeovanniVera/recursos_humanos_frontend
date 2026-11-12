import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Modal } from './modal.component';

/** What the `showModal` stub recorded, one entry per call. */
const showModalCalls: string[] = [];

interface DialogPrototypePatch {
  showModal: () => void;
  close: () => void;
}

/**
 * jsdom ships `HTMLDialogElement` without `showModal` / `close`, so the spec has
 * to provide them. Production code is untouched: it calls the platform API.
 *
 * The stub is a faithful enough stand-in: opening reflects the `open` attribute
 * (which is what makes the element render), and closing removes it and fires the
 * `close` event the component listens to.
 */
function patchDialogPrototype(): void {
  const proto = HTMLDialogElement.prototype as unknown as DialogPrototypePatch;

  proto.showModal = function (this: HTMLDialogElement) {
    showModalCalls.push('showModal');
    this.setAttribute('open', '');
  };

  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

@Component({
  imports: [Modal],
  template: `
    <app-modal
      title="Eliminar empleado"
      [size]="size()"
      [dismissible]="dismissible()"
      [(open)]="open"
    >
      <p class="content">Se eliminará el expediente completo.</p>
      <ng-template #actions>
        <button type="button" class="action">Cancelar</button>
      </ng-template>
    </app-modal>
  `,
})
class ModalHost {
  readonly open = signal(false);
  readonly dismissible = signal(true);
  readonly size = signal<'md' | 'lg'>('md');
}

/** The panel of the dialog: 440 x 400, centred, as the browser would report it. */
const PANEL_RECT = {
  x: 200,
  y: 100,
  left: 200,
  top: 100,
  right: 640,
  bottom: 500,
  width: 440,
  height: 400,
} as DOMRect;

function dialogOf(fixture: ComponentFixture<ModalHost>): HTMLDialogElement {
  const dialog = (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog');
  if (dialog === null) {
    throw new Error('No dialog rendered');
  }
  return dialog;
}

async function openHost(): Promise<ComponentFixture<ModalHost>> {
  const fixture = TestBed.createComponent(ModalHost);
  await fixture.whenStable();
  fixture.componentInstance.open.set(true);
  await fixture.whenStable();
  return fixture;
}

describe('Modal', () => {
  beforeEach(async () => {
    showModalCalls.length = 0;
    patchDialogPrototype();
    await TestBed.configureTestingModule({
      imports: [ModalHost],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('calls showModal when the open model turns true', async () => {
    const fixture = await openHost();

    expect(showModalCalls).toEqual(['showModal']);
    expect(dialogOf(fixture).hasAttribute('open')).toBe(true);
  });

  it('does not touch the dialog while the model stays false', async () => {
    const fixture = TestBed.createComponent(ModalHost);
    await fixture.whenStable();

    expect(showModalCalls).toEqual([]);
    expect(dialogOf(fixture).hasAttribute('open')).toBe(false);
  });

  it('flips the model back when the native close event fires', async () => {
    const fixture = await openHost();

    dialogOf(fixture).dispatchEvent(new Event('close'));
    await fixture.whenStable();

    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('closes from the header button and reports it to the parent', async () => {
    const fixture = await openHost();
    const close = dialogOf(fixture).querySelector<HTMLButtonElement>('.close');

    expect(close?.getAttribute('aria-label')).toBe('Cerrar');

    close?.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.open()).toBe(false);
    expect(dialogOf(fixture).hasAttribute('open')).toBe(false);
  });

  it('closes on a click on the backdrop', async () => {
    const fixture = await openHost();
    const dialog = dialogOf(fixture);
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(PANEL_RECT);

    // Outside the panel box: that is the scrim, painted by the dialog itself.
    dialog.dispatchEvent(new MouseEvent('click', { clientX: 40, clientY: 40 }));
    await fixture.whenStable();

    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('keeps the dialog open on a click inside the panel', async () => {
    const fixture = await openHost();
    const dialog = dialogOf(fixture);
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(PANEL_RECT);

    // Same target (the dialog paints its own padding) but inside the box.
    const inside = new MouseEvent('click', {
      clientX: 300,
      clientY: 200,
      bubbles: true,
    });
    dialog.dispatchEvent(inside);
    await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(true);

    // And a click on real content belongs to the content, not to the scrim.
    const content = dialog.querySelector('.content') as HTMLElement;
    content.dispatchEvent(new MouseEvent('click', { clientX: 5, clientY: 5, bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(true);
  });

  it('blocks Escape while it is not dismissible', async () => {
    const fixture = TestBed.createComponent(ModalHost);
    fixture.componentInstance.dismissible.set(false);
    await fixture.whenStable();
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    const cancel = new Event('cancel', { cancelable: true });
    dialogOf(fixture).dispatchEvent(cancel);
    await fixture.whenStable();

    expect(cancel.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.open()).toBe(true);
  });

  it('blocks the backdrop too while it is not dismissible', async () => {
    const fixture = TestBed.createComponent(ModalHost);
    fixture.componentInstance.dismissible.set(false);
    await fixture.whenStable();
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    const dialog = dialogOf(fixture);
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(PANEL_RECT);
    dialog.dispatchEvent(new MouseEvent('click', { clientX: 5, clientY: 5 }));
    await fixture.whenStable();

    expect(fixture.componentInstance.open()).toBe(true);
    // A pinned layer shows no close button either.
    expect(dialog.querySelector('.close')).toBeNull();
  });

  it('labels the dialog with its own title and projects the actions', async () => {
    const fixture = await openHost();
    const dialog = dialogOf(fixture);

    const labelledBy = dialog.getAttribute('aria-labelledby');
    const title = dialog.querySelector<HTMLElement>('.title');
    expect(title?.id).toBe(labelledBy);
    expect(title?.textContent).toContain('Eliminar empleado');

    const footer = dialog.querySelector('.footer');
    expect(footer?.querySelector('.action')?.textContent).toContain('Cancelar');
  });

  it('switches the panel width with the size input', async () => {
    const fixture = await openHost();
    expect(dialogOf(fixture).classList.contains('is-md')).toBe(true);

    fixture.componentInstance.size.set('lg');
    await fixture.whenStable();

    expect(dialogOf(fixture).classList.contains('is-lg')).toBe(true);
  });
});
