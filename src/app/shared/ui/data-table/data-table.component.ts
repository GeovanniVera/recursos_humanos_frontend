import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, computed, contentChild, input, output } from '@angular/core';

/**
 * One column of the table.
 *
 * `key` is the property name read from each row; `header` is the copy of the
 * column, which is Spanish because it is UI text, unlike the row keys.
 */
export interface TableColumn {
  key: string;
  header: string;
  /** `end` for numbers and money: it also switches digits to tabular-nums. */
  align?: 'start' | 'end';
  /** Any CSS length. Omitted, the column takes its share of the width. */
  width?: string;
}

/** Rows are plain records: the table never assumes a domain model. */
export type TableRow = Record<string, unknown>;

/** How many skeleton rows stand in for data while it loads. */
const SKELETON_ROWS = 4;

/**
 * The table of the design system: a semantic `<table>` inside a glass card.
 *
 * It stays generic on purpose. A typed table per feature would duplicate the
 * same markup, the same skeleton and the same empty state; a caller that needs
 * a trailing action column projects `#rowActions`, and a caller that needs a
 * cell with a shape of its own (a badge, a link) projects `#cell` and decides
 * per column. The table never learns what a state or an area is.
 */
@Component({
  selector: 'app-data-table',
  imports: [NgTemplateOutlet],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTable {
  readonly columns = input<readonly TableColumn[]>([]);
  readonly rows = input<readonly TableRow[]>([]);
  readonly loading = input(false);
  readonly emptyMessage = input('No hay registros para mostrar.');
  /** Read by assistive tech only: it labels the table instead of the screen. */
  readonly caption = input('');
  /** Row to mark as selected. Compared against `rowKey`. */
  readonly activeKey = input<string | number | null>(null);
  /** Name of the field that identifies a row. */
  readonly rowKey = input('id');

  /**
   * Turns the rows into an affordance: the pointer cursor that says "this row
   * can be opened".
   *
   * It is opt-in because a plain table of figures must not suggest a click
   * target, and because existing callers must not change by accident: with the
   * default `false` nothing about the markup, the styling or the events is
   * different from before this input existed.
   */
  readonly clickableRows = input(false);

  /**
   * Emitted when a row is activated with the pointer.
   *
   * A `<tr>` is not a button: it has no `tabindex`, no role and no keyboard
   * activation, and faking them with `keydown` on a table row lies to assistive
   * tech about what the element is. Keyboard access for a row belongs to a real
   * `<button>` rendered inside a cell through `#cell`, which is what this
   * component expects a caller with clickable rows to project. So the row click
   * is a pointer-only shortcut for the same action the button performs, and it
   * stays silent unless `clickableRows` is on.
   */
  readonly rowClick = output<TableRow>();

  /** Trailing actions column, present only when something is projected. */
  protected readonly rowActions = contentChild('rowActions', { read: TemplateRef });

  /**
   * Optional renderer for every body cell.
   *
   * It receives `{ $implicit: row, column, value }`, so the caller branches on
   * `column.key` and renders the columns that need it while falling back to the
   * plain text for the rest. Without it the table prints the raw value, which
   * is all a cell of text needs.
   */
  protected readonly cellTemplate = contentChild('cell', { read: TemplateRef });

  /**
   * Optional renderer for a header cell.
   *
   * It receives `{ column }`. Only the callers whose header is a control need it
   * — a "select the whole page" checkbox has to live in the `<th>` of its own
   * column, since a control in the body would sit one row too low. Without it
   * the column prints its header, which is what every existing caller wants.
   */
  protected readonly headCellTemplate = contentChild('headCell', { read: TemplateRef });

  protected readonly skeletons = Array.from({ length: SKELETON_ROWS }, (_, index) => index);

  /** Width of the loading and empty rows: every column, plus actions. */
  protected readonly columnCount = computed(
    () => this.columns().length + (this.rowActions() ? 1 : 0),
  );

  /** Reads a cell without assuming the value is printable. */
  protected cell(row: TableRow, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }

  /** Context handed to the projected cell renderer. */
  protected cellContext(row: TableRow, column: TableColumn): Record<string, unknown> {
    return { $implicit: row, column, value: row[column.key] };
  }

  protected isActive(row: TableRow): boolean {
    const key = this.activeKey();
    if (key === null || key === undefined) {
      return false;
    }
    return this.cell(row, this.rowKey()) === String(key);
  }

  /**
   * Pointer shortcut of the row action.
   *
   * Guarded by `clickableRows` so a table that is not meant to be interactive
   * stays inert even for a caller that happens to bind `rowClick`: a projected
   * row action or a link inside a cell then never fires the row handler by
   * accident.
   */
  protected onRowClick(row: TableRow): void {
    if (!this.clickableRows()) {
      return;
    }
    this.rowClick.emit(row);
  }
}
