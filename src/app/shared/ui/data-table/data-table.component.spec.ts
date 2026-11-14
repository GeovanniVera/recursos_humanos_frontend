import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataTable, TableColumn, TableRow } from './data-table.component';

const COLUMNS: readonly TableColumn[] = [
  { key: 'folio', header: 'Folio' },
  { key: 'nombre', header: 'Nombre' },
  { key: 'antiguedad', header: 'Antigüedad', align: 'end' },
];

const ROWS: readonly TableRow[] = [
  { id: 'RH-0042', folio: 'RH-0042', nombre: 'Ana Martínez', antiguedad: 6 },
  { id: 'RH-0051', folio: 'RH-0051', nombre: 'Luis Ramírez', antiguedad: 2 },
];

/** Host with a projected actions template: the table renders it, not its callers. */
@Component({
  imports: [DataTable],
  template: `
    <app-data-table [columns]="columns" [rows]="rows" [activeKey]="activeKey" rowKey="id">
      <ng-template #rowActions let-row>
        <button type="button" class="row-action">{{ row['folio'] }}</button>
      </ng-template>
    </app-data-table>
  `,
})
class TableHost {
  readonly columns = COLUMNS;
  readonly rows = ROWS;
  readonly activeKey = 'RH-0051';
}

/** Host whose first column is a control, so it projects a header renderer too. */
@Component({
  imports: [DataTable],
  template: `
    <app-data-table [columns]="columns" [rows]="rows">
      <ng-template #headCell let-column="column">
        @if (column.key === 'folio') {
          <input type="checkbox" class="head-check" aria-label="Seleccionar todo" />
        } @else {
          {{ column.header }}
        }
      </ng-template>
    </app-data-table>
  `,
})
class HeadHost {
  readonly columns = COLUMNS;
  readonly rows = ROWS;
}

function tableOf(fixture: ComponentFixture<unknown>): HTMLTableElement {
  const table = (fixture.nativeElement as HTMLElement).querySelector<HTMLTableElement>('table');
  if (table === null) {
    throw new Error('No table rendered');
  }
  return table;
}

describe('DataTable', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataTable, HeadHost, TableHost],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the header and the rows', async () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    await fixture.whenStable();

    const table = tableOf(fixture);
    const headers = Array.from(table.querySelectorAll('th')).map((cell) =>
      cell.textContent?.trim(),
    );
    expect(headers).toEqual(['Folio', 'Nombre', 'Antigüedad']);
    expect(table.querySelectorAll('th[scope="col"]').length).toBe(3);

    const body = Array.from(table.querySelectorAll('tbody tr'));
    expect(body.length).toBe(2);
    expect(body[0].textContent).toContain('Ana Martínez');
    expect(body[1].textContent).toContain('Luis Ramírez');
  });

  it('shows the empty message when there are no rows', async () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', COLUMNS);
    await fixture.whenStable();

    const cell = tableOf(fixture).querySelector('tbody td');
    expect(cell?.textContent?.trim()).toBe('No hay registros para mostrar.');
    expect(cell?.getAttribute('colspan')).toBe('3');
  });

  it('accepts a custom empty message', async () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('emptyMessage', 'Sin empleados activos.');
    await fixture.whenStable();

    expect(tableOf(fixture).querySelector('tbody td')?.textContent?.trim()).toBe(
      'Sin empleados activos.',
    );
  });

  it('marks the table busy and hides the skeleton rows from assistive tech', async () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('loading', true);
    await fixture.whenStable();

    const table = tableOf(fixture);
    expect(table.getAttribute('aria-busy')).toBe('true');

    const skeletons = Array.from(table.querySelectorAll('tbody tr'));
    expect(skeletons.length).toBe(4);
    for (const row of skeletons) {
      expect(row.getAttribute('aria-hidden')).toBe('true');
      expect(row.querySelectorAll('.skeleton').length).toBe(3);
      expect(row.textContent?.trim()).toBe('');
    }
  });

  it('renders the projected row actions with the row as context', async () => {
    const fixture = TestBed.createComponent(TableHost);
    await fixture.whenStable();

    const table = tableOf(fixture);
    // One extra column, headed for assistive tech only.
    expect(table.querySelectorAll('th').length).toBe(4);
    expect(table.querySelector('th.actions')?.textContent?.trim()).toBe('Acciones');

    const actions = Array.from(table.querySelectorAll<HTMLButtonElement>('.row-action'));
    expect(actions.length).toBe(2);
    expect(actions[0].textContent).toContain('RH-0042');
    expect(actions[1].textContent).toContain('RH-0051');
  });

  it('marks the row that matches activeKey', async () => {
    const fixture = TestBed.createComponent(TableHost);
    await fixture.whenStable();

    const rows = Array.from(tableOf(fixture).querySelectorAll('tbody tr'));
    expect(rows[0].classList.contains('is-active')).toBe(false);
    expect(rows[1].classList.contains('is-active')).toBe(true);
  });

  it('renders a visually hidden caption when one is given', async () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('caption', 'Empleados activos');
    await fixture.whenStable();

    const caption = tableOf(fixture).querySelector('caption');
    expect(caption?.textContent).toContain('Empleados activos');
    expect(caption?.classList.contains('visually-hidden')).toBe(true);
  });

  it('aligns the numeric column to the end', async () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    await fixture.whenStable();

    const headers = Array.from(tableOf(fixture).querySelectorAll('th'));
    expect(headers[2].classList.contains('is-end')).toBe(true);
    expect(headers[0].classList.contains('is-end')).toBe(false);
  });

  it('renders a projected header control in place of the header text', async () => {
    const fixture = TestBed.createComponent(HeadHost);
    await fixture.whenStable();

    const headers = Array.from(tableOf(fixture).querySelectorAll('th'));
    // The control lives in the header of its own column, not in a row below it.
    const casilla = headers[0].querySelector<HTMLInputElement>('input.head-check');
    expect(casilla).not.toBeNull();
    expect(casilla?.getAttribute('aria-label')).toBe('Seleccionar todo');

    // Every other column keeps the plain header.
    expect(headers[1].textContent?.trim()).toBe('Nombre');
    expect(headers[2].textContent?.trim()).toBe('Antigüedad');
  });

  it('adds data-label attributes and is-cards class in cards mobileMode without dropping thead', async () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('mobileMode', 'cards');
    await fixture.whenStable();

    const table = tableOf(fixture);
    expect(table.classList.contains('is-cards')).toBe(true);
    expect(table.querySelector('thead')).not.toBeNull();

    const firstRowCells = Array.from(table.querySelectorAll('tbody tr:first-child td'));
    expect(firstRowCells.map((cell) => cell.getAttribute('data-label'))).toEqual([
      'Folio',
      'Nombre',
      'Antigüedad',
    ]);
  });

  it('shows horizontal scroll indicators in scroll mobileMode when content overflows', async () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('mobileMode', 'scroll');
    await fixture.whenStable();

    const hostEl = fixture.nativeElement as HTMLElement;
    const wrap = hostEl.querySelector<HTMLDivElement>('.wrap')!;
    Object.defineProperty(wrap, 'scrollWidth', { configurable: true, value: 640 });
    Object.defineProperty(wrap, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(wrap, 'scrollLeft', { configurable: true, writable: true, value: 0 });

    wrap.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();

    expect(wrap.classList.contains('is-scroll')).toBe(true);
    expect(wrap.classList.contains('has-overflow')).toBe(true);
    expect(wrap.classList.contains('can-scroll-right')).toBe(true);
    expect(wrap.classList.contains('can-scroll-left')).toBe(false);
    expect(hostEl.querySelector('.scroll-hint')).not.toBeNull();

    wrap.scrollLeft = 100;
    wrap.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();

    expect(wrap.classList.contains('can-scroll-left')).toBe(true);
    expect(wrap.classList.contains('can-scroll-right')).toBe(true);
  });

  it('tracks rows by rowKey identity and falls back safely when key is absent', async () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('rowKey', 'id');
    await fixture.whenStable();

    const firstRowBefore = tableOf(fixture).querySelector('tbody tr');
    fixture.componentRef.setInput('rows', [ROWS[1], ROWS[0]]);
    await fixture.whenStable();

    const rowsAfter = tableOf(fixture).querySelectorAll('tbody tr');
    expect(rowsAfter[1]).toBe(firstRowBefore);

    // Rows missing `rowKey` fall back to index without duplicate track key errors.
    fixture.componentRef.setInput('rows', [{ nombre: 'Sin id 1' }, { nombre: 'Sin id 2' }]);
    await fixture.whenStable();
    expect(tableOf(fixture).querySelectorAll('tbody tr').length).toBe(2);
  });

  it('defaults to the plain variant and leaves the plain markup untouched', async () => {
    const plain = TestBed.createComponent(DataTable);
    plain.componentRef.setInput('columns', COLUMNS);
    plain.componentRef.setInput('rows', ROWS);
    await plain.whenStable();

    const host = plain.nativeElement as HTMLElement;
    const table = tableOf(plain);
    const wrap = host.querySelector<HTMLElement>('.wrap')!;

    // The roster and the catalog read this: no ledger, no density class at the
    // default `standard`, and no extra class on the sheet.
    expect(table.classList.contains('is-ledger')).toBe(false);
    expect(table.classList.contains('is-compact')).toBe(false);
    expect(table.classList.contains('is-comfortable')).toBe(false);
    expect(wrap.classList.contains('is-ledger')).toBe(false);

    // The same table asked for `plain` explicitly renders the same class list.
    const explicit = TestBed.createComponent(DataTable);
    explicit.componentRef.setInput('columns', COLUMNS);
    explicit.componentRef.setInput('rows', ROWS);
    explicit.componentRef.setInput('variant', 'plain');
    await explicit.whenStable();

    const explicitTable = tableOf(explicit);
    const explicitWrap = (explicit.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.wrap',
    )!;
    expect(Array.from(explicitTable.classList)).toEqual(Array.from(table.classList));
    expect(Array.from(explicitWrap.classList)).toEqual(Array.from(wrap.classList));
  });

  it('opts into the ledger sheet and the density class only when asked', async () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('variant', 'ledger');
    fixture.componentRef.setInput('density', 'compact');
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const table = tableOf(fixture);
    expect(table.classList.contains('is-ledger')).toBe(true);
    expect(table.classList.contains('is-compact')).toBe(true);
    expect(host.querySelector('.wrap')?.classList.contains('is-ledger')).toBe(true);

    fixture.componentRef.setInput('density', 'comfortable');
    await fixture.whenStable();
    expect(table.classList.contains('is-comfortable')).toBe(true);
    expect(table.classList.contains('is-compact')).toBe(false);

    // The rows are the same rows: the variant is a surface, not a data change.
    expect(table.querySelectorAll('tbody tr').length).toBe(2);
  });
});
