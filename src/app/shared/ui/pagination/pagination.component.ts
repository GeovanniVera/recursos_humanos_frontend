import { Component, computed, input, output } from '@angular/core';
import { Button } from '../button/button.component';

/** Visual density of the pager: full table footer vs compact arrow strip. */
export type PaginationMode = 'full' | 'compact';

let nextPaginationId = 0;

/**
 * Shared paginator for server-backed and buffered listings.
 *
 * Generates unique per-instance DOM ids for its `<label>`, `<select>`,
 * `<input>`, and validation alert elements so multiple paginators can mount on
 * the same view without duplicate-id collisions.
 */
@Component({
  selector: 'app-pagination',
  imports: [Button],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
})
export class Pagination {
  readonly mode = input<PaginationMode>('full');
  readonly rangeText = input.required<string>();
  readonly pageLabel = input.required<string>();
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();

  readonly pageSize = input<number>(20);
  readonly pageSizeOptions = input<readonly number[]>([10, 20, 50, 100]);
  readonly disabled = input<boolean>(false);

  readonly disableFirst = input<boolean | null>(null);
  readonly disablePrev = input<boolean | null>(null);
  readonly disableNext = input<boolean | null>(null);
  readonly disableLast = input<boolean | null>(null);

  readonly jumpError = input<string | null>(null);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();
  readonly jumpSubmit = output<string>();

  private readonly uid = `pagination-${++nextPaginationId}`;
  protected readonly selectId = `${this.uid}-size`;
  protected readonly jumpId = `${this.uid}-jump`;
  protected readonly errorId = `${this.uid}-error`;

  protected readonly maxPage = computed(() => Math.max(1, this.totalPages()));

  protected readonly firstIsDisabled = computed(
    () => this.disableFirst() ?? (this.disabled() || this.page() <= 1),
  );
  protected readonly prevIsDisabled = computed(
    () => this.disablePrev() ?? (this.disabled() || this.page() <= 1),
  );
  protected readonly nextIsDisabled = computed(
    () => this.disableNext() ?? (this.disabled() || this.page() >= this.maxPage()),
  );
  protected readonly lastIsDisabled = computed(
    () => this.disableLast() ?? (this.disabled() || this.page() >= this.maxPage()),
  );

  protected readonly footerClass = computed(() => `pager is-${this.mode()}`);

  protected goTo(target: number): void {
    if (this.disabled()) {
      return;
    }
    this.pageChange.emit(target);
  }

  protected onSizeChange(event: Event): void {
    const size = Number((event.target as HTMLSelectElement).value);
    if (!Number.isFinite(size)) {
      return;
    }
    this.pageSizeChange.emit(size);
  }

  protected onJumpSubmit(event: Event, value: string): void {
    event.preventDefault();
    if (this.disabled()) {
      return;
    }
    this.jumpSubmit.emit(value);
  }
}
