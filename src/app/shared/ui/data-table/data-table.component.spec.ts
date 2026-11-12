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
      imports: [DataTable, TableHost],
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
});
