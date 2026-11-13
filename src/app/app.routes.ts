import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { AppShell } from './layout/app-shell/app-shell.component';

/** Lazy loader of the generic placeholder screen used by unbuilt destinations. */
const placeholder = () =>
  import('./shared/ui/placeholder-page/placeholder-page.component').then((m) => m.PlaceholderPage);

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login-page/login-page.component').then((m) => m.LoginPage),
  },
  {
    path: '',
    component: AppShell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        data: { breadcrumb: 'Panel general' },
        loadComponent: () =>
          import('./features/dashboard/dashboard-page.component').then((m) => m.DashboardPage),
      },
      {
        path: 'empleados',
        // A branch with no screen of its own: it is a componentless route whose
        // breadcrumb gives the trail its middle step.
        data: { breadcrumb: 'Empleados' },
        children: [
          {
            path: '',
            pathMatch: 'full',
            // The branch is an index: it names the sections and leads to them.
            // The listing lives where it belongs, under `activos`.
            loadComponent: () =>
              import('./features/empleados/empleados-index.component').then(
                (m) => m.EmpleadosIndex,
              ),
          },
          {
            path: 'activos',
            data: { breadcrumb: 'Empleados activos' },
            loadComponent: () =>
              import('./features/empleados/empleados-page.component').then((m) => m.EmpleadosPage),
          },
          {
            path: 'alta',
            // A child of the branch, not a top level screen: the alta belongs to
            // the roster it feeds, and the trail reads `Empleados › Alta`.
            data: { breadcrumb: 'Alta de empleado' },
            loadComponent: () =>
              import('./features/empleados/alta/alta-page.component').then((m) => m.AltaPage),
          },
          {
            path: 'baja',
            data: {
              breadcrumb: 'Empleados baja',
              titulo: 'Empleados baja',
              descripcion:
                'Las bajas de personal, con su fecha, su motivo y el archivo histórico, llegan en la siguiente iteración.',
            },
            loadComponent: placeholder,
          },
        ],
      },
      {
        path: 'semaforo-documentos',
        data: {
          breadcrumb: 'Semáforo de documentos',
          titulo: 'Semáforo de documentos',
          descripcion:
            'El semáforo de expedientes por empleado, con sus faltantes y sus vencimientos, llega en la siguiente iteración.',
        },
        loadComponent: placeholder,
      },
      {
        path: 'admin/catalogos',
        // One flat route instead of an `admin` branch with its own breadcrumb:
        // the trail the product asked for is a single step, `Catálogos`.
        data: { breadcrumb: 'Catálogos' },
        loadComponent: () =>
          import('./features/admin/catalogos/catalogos-page.component').then(
            (m) => m.CatalogosPage,
          ),
      },
      {
        path: 'ajustes',
        data: { breadcrumb: 'Ajustes' },
        loadComponent: () =>
          import('./features/ajustes/ajustes-page.component').then((m) => m.AjustesPage),
      },
      {
        path: 'tokens',
        data: { breadcrumb: 'Tokens' },
        loadComponent: () =>
          import('./features/dev/token-preview/token-preview.component').then(
            (m) => m.TokenPreview,
          ),
      },
      {
        path: 'ui',
        data: { breadcrumb: 'UI kit' },
        loadComponent: () => import('./features/dev/ui-kit/ui-kit.component').then((m) => m.UiKit),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
