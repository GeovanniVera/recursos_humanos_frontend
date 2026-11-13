import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Pagination } from './pagination.component';

@Component({
  imports: [Pagination],
  template: `
    <app-pagination
      rangeText="Mostrando 1 a 20 de 100"
      pageLabel="Página 1 de 5"
      [page]="1"
      [totalPages]="5"
      [pageSize]="pageSize()"
      [jumpError]="jumpError()"
      (pageChange)="lastPage = $event"
      (pageSizeChange)="pageSize.set($event)"
      (jumpSubmit)="lastJump = $event"
    />
    <app-pagination
      rangeText="Mostrando 1 a 10 de 40"
      pageLabel="Página 2 de 4"
      [page]="2"
      [totalPages]="4"
    />
  `,
})
class DualPaginationHost {
  readonly pageSize = signal(20);
  readonly jumpError = signal<string | null>(null);
  lastPage: number | null = null;
  lastJump: string | null = null;
}

@Component({
  imports: [Pagination],
  template: `
    <app-pagination
      mode="compact"
      rangeText="1 a 10 de 25"
      pageLabel="Página 1 de 3"
      [page]="page()"
      [totalPages]="3"
      (pageChange)="page.set($event)"
    />
  `,
})
class CompactPaginationHost {
  readonly page = signal(1);
}

describe('Pagination', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DualPaginationHost, CompactPaginationHost],
    }).compileComponents();
  });

  it('assigns unique label/select/input/error ids per instance so multiple pagers never collide', () => {
    const fixture = TestBed.createComponent(DualPaginationHost);
    fixture.componentInstance.jumpError.set('Número inválido');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const selects = Array.from(root.querySelectorAll<HTMLSelectElement>('select.page-size-select'));
    const selectLabels = Array.from(root.querySelectorAll<HTMLLabelElement>('label.page-size-label'));
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input.jump-field'));
    const jumpLabels = Array.from(root.querySelectorAll<HTMLLabelElement>('label.jump-label'));
    const errorEl = root.querySelector<HTMLElement>('.jump-error[role="alert"]');

    expect(selects.length).toBe(2);
    expect(selects[0].id).toBeTruthy();
    expect(selects[1].id).toBeTruthy();
    expect(selects[0].id).not.toBe(selects[1].id);
    expect(selectLabels[0].getAttribute('for')).toBe(selects[0].id);
    expect(selectLabels[1].getAttribute('for')).toBe(selects[1].id);

    expect(inputs.length).toBe(2);
    expect(inputs[0].id).toBeTruthy();
    expect(inputs[1].id).toBeTruthy();
    expect(inputs[0].id).not.toBe(inputs[1].id);
    expect(jumpLabels[0].getAttribute('for')).toBe(inputs[0].id);
    expect(jumpLabels[1].getAttribute('for')).toBe(inputs[1].id);

    expect(errorEl?.id).toBeTruthy();
    expect(inputs[0].getAttribute('aria-describedby')).toBe(errorEl?.id);
    expect(inputs[1].getAttribute('aria-describedby')).toBeNull();
  });

  it('emits pageChange, pageSizeChange and jumpSubmit in full mode', () => {
    const fixture = TestBed.createComponent(DualPaginationHost);
    fixture.detectChanges();

    const firstPager = fixture.nativeElement.querySelector('app-pagination') as HTMLElement;
    const buttons = Array.from(firstPager.querySelectorAll<HTMLButtonElement>('.pager-controls button'));
    // Primera and Anterior disabled on page 1; Siguiente and Última enabled
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[2].disabled).toBe(false);
    expect(buttons[3].disabled).toBe(false);

    buttons[2].click();
    expect(fixture.componentInstance.lastPage).toBe(2);

    const select = firstPager.querySelector<HTMLSelectElement>('select.page-size-select')!;
    select.value = '50';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.pageSize()).toBe(50);

    const input = firstPager.querySelector<HTMLInputElement>('input.jump-field')!;
    input.value = '4';
    firstPager.querySelector<HTMLFormElement>('form.pager-jump')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(fixture.componentInstance.lastJump).toBe('4');
  });

  it('supports compact arrow navigation mode for CatalogosPage', () => {
    const fixture = TestBed.createComponent(CompactPaginationHost);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const prev = root.querySelector<HTMLButtonElement>('button[aria-label="Página anterior"]')!;
    const next = root.querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')!;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    next.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.page()).toBe(2);
  });
});
