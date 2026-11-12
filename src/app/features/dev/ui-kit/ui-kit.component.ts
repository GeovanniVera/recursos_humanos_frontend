import { Component, computed, inject, signal } from '@angular/core';
import { Button } from '../../../shared/ui/button/button.component';
import {
  DataTable,
  TableColumn,
  TableRow,
} from '../../../shared/ui/data-table/data-table.component';
import { Drawer } from '../../../shared/ui/drawer/drawer.component';
import { Modal } from '../../../shared/ui/modal/modal.component';
import { ToastService, ToastType } from '../../../shared/ui/toast/toast.service';

/** One example of the toast row: the copy and the toast it raises. */
interface ToastExample {
  label: string;
  type: ToastType;
  title: string;
  message: string;
}

/**
 * QA screen of the UI kit, reachable at `/ui`.
 *
 * It exists to prove every component of the kit in the three themes and with a
 * keyboard, the same way `/tokens` proves the token layer. It composes; it never
 * styles a component itself.
 */
@Component({
  selector: 'app-ui-kit',
  imports: [Button, DataTable, Drawer, Modal],
  templateUrl: './ui-kit.component.html',
  styleUrl: './ui-kit.component.scss',
})
export class UiKit {
  private readonly toastService = inject(ToastService);

  readonly modalOpen = signal(false);
  readonly wideModalOpen = signal(false);
  readonly drawerOpen = signal(false);
  readonly drawerSide = signal<'right' | 'left'>('right');

  readonly tableLoading = signal(false);
  readonly tableEmpty = signal(false);

  /** Folio of the selected row, used as `activeKey`. */
  readonly selectedKey = signal<string | null>('RH-0042');

  readonly columns: readonly TableColumn[] = [
    { key: 'folio', header: 'Folio', width: '120px' },
    { key: 'nombre', header: 'Nombre' },
    { key: 'area', header: 'Área' },
    { key: 'antiguedad', header: 'Antigüedad', align: 'end', width: '140px' },
  ];

  readonly employees: readonly TableRow[] = [
    { folio: 'RH-0042', nombre: 'Ana Martínez', area: 'Recursos Humanos', antiguedad: '6 años' },
    { folio: 'RH-0051', nombre: 'Luis Ramírez', area: 'Mantenimiento', antiguedad: '2 años' },
    { folio: 'RH-0063', nombre: 'Sofía Herrera', area: 'Finanzas', antiguedad: '9 años' },
  ];

  /** Same rows, cut down to nothing: the empty state needs a table with no data. */
  readonly previewRows = computed<readonly TableRow[]>(() =>
    this.tableEmpty() ? [] : this.employees.slice(0, 2),
  );

  readonly toastExamples: readonly ToastExample[] = [
    {
      label: 'Éxito',
      type: 'success',
      title: 'Guardado correctamente',
      message: 'Los cambios del empleado ya están aplicados.',
    },
    {
      label: 'Error',
      type: 'error',
      title: 'Error al guardar',
      message: 'No se pudo guardar el empleado. Revisa tu conexión y vuelve a intentarlo.',
    },
    {
      label: 'Información',
      type: 'info',
      title: 'Nueva versión disponible',
      message: 'Actualiza para ver las mejoras del panel.',
    },
    {
      label: 'Advertencia',
      type: 'warning',
      title: 'Sesión por expirar',
      message: 'Tu sesión se cerrará en 5 minutos por inactividad.',
    },
  ];

  notify(example: ToastExample): void {
    this.toastService.show({
      type: example.type,
      title: example.title,
      message: example.message,
    });
  }

  /** `duration: 0` pins the toast: it leaves only when the user closes it. */
  notifyPinned(): void {
    this.toastService.show(
      {
        type: 'info',
        title: 'Sin cierre automático',
        message: 'Esta notificación se queda hasta que la cierres.',
      },
      { duration: 0 },
    );
  }

  dismissAll(): void {
    this.toastService.dismissAll();
  }

  openDrawer(side: 'right' | 'left'): void {
    this.drawerSide.set(side);
    this.drawerOpen.set(true);
  }

  select(row: TableRow): void {
    const folio = row['folio'];
    this.selectedKey.set(typeof folio === 'string' ? folio : null);
  }

  toggleLoading(): void {
    this.tableLoading.update((loading) => !loading);
  }

  toggleEmpty(): void {
    this.tableEmpty.update((empty) => !empty);
  }
}
