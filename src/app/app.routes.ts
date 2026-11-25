import { Routes } from '@angular/router';
import { environment } from '../environments/environment';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { ESTATUS_INICIAL, TITULO_ESTATUS } from './core/empleados/estatus-ui';
import { AppShell } from './layout/app-shell/app-shell.component';

/** Visual token & UI kit routes exposed strictly in non-production builds. */
const devRoutes: Routes = !environment.produccion
  ? [
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
    ]
  : [];

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
      // Legacy post-login landing routes returned by older backend module maps.
      { path: 'admin', pathMatch: 'full', redirectTo: '' },
      { path: 'solicitudes', pathMatch: 'full', redirectTo: '' },
      { path: 'circulares', pathMatch: 'full', redirectTo: '' },
      {
        path: 'empleados',
        // The listing is the whole branch: every status lives in one screen with
        // its tabs, so there is no index above it and no `/baja` beside it. The
        // last step of the trail follows the pressed tab.
        data: {
          breadcrumb: TITULO_ESTATUS[ESTATUS_INICIAL],
          breadcrumbByEstatus: TITULO_ESTATUS,
        },
        loadComponent: () =>
          import('./features/empleados/empleados-page.component').then((m) => m.EmpleadosPage),
      },
      // Old addresses of the branch. The index, the roster and the baja listing
      // were three screens; now they are one, and a bookmark or a link from a
      // document lands on it instead of a 404. `redirectTo` keeps the query, so
      // `?estatus=licencia` still opens that tab.
      { path: 'empleados/activos', pathMatch: 'full', redirectTo: 'empleados' },
      { path: 'empleados/baja', pathMatch: 'full', redirectTo: 'empleados' },
      { path: 'empleados/alta', pathMatch: 'full', redirectTo: 'empleados' },
      { path: 'empleados/:id/editar', pathMatch: 'full', redirectTo: 'empleados' },
      {
        path: 'semaforo-documentos',
        data: { breadcrumb: 'Semáforo de Completitud' },
        loadComponent: () =>
          import('./features/semaforo/semaforo-page.component').then((m) => m.SemaforoPage),
      },
      {
        path: 'mensajeria',
        data: { breadcrumb: 'Correos masivos' },
        loadComponent: () =>
          import('./features/mensajeria/mensajeria-page.component').then(
            (m) => m.MensajeriaPage,
          ),
      },
      {
        path: 'mensajeria/autorizaciones',
        data: { breadcrumb: 'Autorizaciones' },
        loadComponent: () =>
          import('./features/mensajeria/autorizaciones-page/autorizaciones-page.component').then(
            (m) => m.AutorizacionesPage,
          ),
      },
      {
        path: 'mensajeria/borradores',
        data: { breadcrumb: 'Borradores' },
        loadComponent: () =>
          import('./features/mensajeria/borradores-page/borradores-page.component').then(
            (m) => m.BorradoresPage,
          ),
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
        path: 'admin/usuarios',
        data: { breadcrumb: 'Usuarios y roles' },
        loadComponent: () =>
          import('./features/admin/usuarios/usuarios-page.component').then(
            (m) => m.UsuariosPage,
          ),
      },
      {
        path: 'bitacora',
        data: { breadcrumb: 'Bitácora' },
        loadComponent: () =>
          import('./features/bitacora/bitacora-page.component').then((m) => m.BitacoraPage),
      },
      {
        path: 'ajustes',
        data: { breadcrumb: 'Ajustes' },
        loadComponent: () =>
          import('./features/ajustes/ajustes-page.component').then((m) => m.AjustesPage),
      },
      ...devRoutes,
    ],
  },
  {
    path: '403',
    data: { code: '403', breadcrumb: 'Acceso restringido' },
    loadComponent: () =>
      import('./features/errors/error-page.component').then((m) => m.ErrorPage),
  },
  {
    path: '404',
    data: { code: '404', breadcrumb: 'Página no encontrada' },
    loadComponent: () =>
      import('./features/errors/error-page.component').then((m) => m.ErrorPage),
  },
  {
    path: '500',
    data: { code: '500', breadcrumb: 'Error interno' },
    loadComponent: () =>
      import('./features/errors/error-page.component').then((m) => m.ErrorPage),
  },
  {
    path: '**',
    data: { code: '404', breadcrumb: 'Página no encontrada' },
    loadComponent: () =>
      import('./features/errors/error-page.component').then((m) => m.ErrorPage),
  },
];
