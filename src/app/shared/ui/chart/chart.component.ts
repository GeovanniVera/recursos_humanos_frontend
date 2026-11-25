import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  Chart,
  ChartConfiguration,
  ChartData,
  ChartOptions,
  ChartType,
  registerables,
} from 'chart.js';

Chart.register(...registerables);

export type ChartKind = Extract<ChartType, 'bar' | 'doughnut' | 'pie'>;

/** Reads a CSS custom property from `:root`, returning `respaldo` when unavailable (e.g. jsdom). */
export function leerTokenColor(nombre: string, respaldo: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return respaldo;
  }
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || respaldo;
}

/** Institutional chart palette derived from design tokens. */
export function paletaGrafica(): string[] {
  return [
    leerTokenColor('--color-accent', '#1b4d89'),
    leerTokenColor('--color-state-success', '#2f6f4e'),
    leerTokenColor('--color-state-warning', '#b26b1b'),
    leerTokenColor('--color-state-error', '#a63a3a'),
    leerTokenColor('--color-text-secondary', '#5b6472'),
    leerTokenColor('--color-accent-hover', '#143a68'),
  ];
}

/**
 * Reusable Chart.js wrapper for bar, doughnut, and pie charts.
 * Safely no-ops when 2D canvas context is unavailable (e.g. unit tests in jsdom).
 */
@Component({
  selector: 'app-chart',
  template: `
    <div class="chart-wrap" [style.height.px]="height()">
      <canvas #canvas [attr.aria-label]="ariaLabel() || null" role="img"></canvas>
    </div>
  `,
  styleUrl: './chart.component.scss',
})
export class ChartComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  readonly type = input.required<ChartKind>();
  readonly data = input.required<ChartData<ChartKind>>();
  readonly options = input<ChartOptions>();
  readonly height = input(240);
  readonly ariaLabel = input('');

  private instance: Chart<ChartKind> | null = null;

  constructor() {
    effect(() => {
      const canvas = this.canvasRef()?.nativeElement;
      const type = this.type();
      const data = this.data();
      const customOptions = this.options();

      if (!canvas) {
        return;
      }

      this.renderChart(canvas, type, data, customOptions);
    });

    this.destroyRef.onDestroy(() => {
      this.instance?.destroy();
      this.instance = null;
    });
  }

  private renderChart(
    canvas: HTMLCanvasElement,
    type: ChartKind,
    data: ChartData<ChartKind>,
    customOptions?: ChartOptions,
  ): void {
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) {
      return;
    }

    this.instance?.destroy();

    const textColor = leerTokenColor('--color-text-secondary', '#5b6472');
    const gridColor = leerTokenColor('--color-border-default', '#d9dee7');

    const baseOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: type !== 'bar',
          position: 'bottom',
          labels: {
            color: textColor,
            boxWidth: 12,
            padding: 14,
          },
        },
        tooltip: {
          enabled: true,
        },
      },
      ...(type === 'bar'
        ? {
            scales: {
              x: {
                ticks: { color: textColor, precision: 0 },
                grid: { color: gridColor },
              },
              y: {
                beginAtZero: true,
                ticks: { color: textColor, precision: 0 },
                grid: { color: gridColor },
              },
            },
          }
        : {}),
    };

    const mergedOptions = {
      ...baseOptions,
      ...customOptions,
      plugins: {
        ...baseOptions.plugins,
        ...customOptions?.plugins,
      },
    } as ChartOptions<ChartKind>;

    const config: ChartConfiguration<ChartKind> = {
      type,
      data,
      options: mergedOptions,
    };

    this.instance = new Chart(ctx, config);
  }
}
