import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Drawer } from './drawer.component';

const showModalCalls: string[] = [];

interface DialogPrototypePatch {
  showModal: () => void;
  close: () => void;
}

/**
 * jsdom ships `HTMLDialogElement` without `showModal` / `close`; the spec
 * provides them. Production code calls the platform API unchanged.
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
  imports: [Drawer],
  template: `
    <app-drawer title="Filtros" [side]="side()" [(open)]="open">
      <p class="content">Estado, área y antigüedad.</p>
      <ng-template #actions>
        <button type="button" class="apply">Aplicar</button>
      </ng-template>
    </app-drawer>
  `,
})
class DrawerHost {
  readonly open = signal(false);
  readonly side = signal<'right' | 'left'>('right');
}

function dialogOf(fixture: ComponentFixture<DrawerHost>): HTMLDialogElement {
  const dialog = (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog');
  if (dialog === null) {
    throw new Error('No dialog rendered');
  }
  return dialog;
}

describe('Drawer', () => {
  beforeEach(async () => {
    showModalCalls.length = 0;
    patchDialogPrototype();
    await TestBed.configureTestingModule({
      imports: [DrawerHost],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('anchors the panel to the right by default', async () => {
    const fixture = TestBed.createComponent(DrawerHost);
    await fixture.whenStable();

    const dialog = dialogOf(fixture);
    expect(dialog.classList.contains('is-right')).toBe(true);
    expect(dialog.classList.contains('is-left')).toBe(false);
    expect(dialog.classList.contains('enter-drawer')).toBe(true);
  });

  it('mirrors the panel to the left when asked', async () => {
    const fixture = TestBed.createComponent(DrawerHost);
    fixture.componentInstance.side.set('left');
    await fixture.whenStable();

    const dialog = dialogOf(fixture);
    expect(dialog.classList.contains('is-left')).toBe(true);
    expect(dialog.classList.contains('is-right')).toBe(false);
  });

  it('projects the body and the actions of the footer', async () => {
    const fixture = TestBed.createComponent(DrawerHost);
    await fixture.whenStable();

    const dialog = dialogOf(fixture);
    expect(dialog.querySelector('.body .content')?.textContent).toContain('Estado, área');
    expect(dialog.querySelector('.footer .apply')?.textContent).toContain('Aplicar');
  });

  it('opens with showModal and closes back into the model', async () => {
    const fixture = TestBed.createComponent(DrawerHost);
    await fixture.whenStable();
    expect(showModalCalls).toEqual([]);

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    expect(showModalCalls).toEqual(['showModal']);

    dialogOf(fixture).dispatchEvent(new Event('close'));
    await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('labels the panel with its own title', async () => {
    const fixture = TestBed.createComponent(DrawerHost);
    await fixture.whenStable();

    const dialog = dialogOf(fixture);
    const title = dialog.querySelector<HTMLElement>('.title');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(title?.textContent).toContain('Filtros');
  });
});
