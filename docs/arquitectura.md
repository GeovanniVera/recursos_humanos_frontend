# Arquitectura del frontend

Este documento describe la arquitectura real del frontend Angular del Sistema de Recursos Humanos de la UTN: cómo arranca, cómo se compone, cómo enruta, cómo habla con el backend y cómo se compila y despliega. Documenta el código tal como está en la rama `develop`; no propone cambios.

## 1. Propósito del repositorio

Back office de Recursos Humanos de la Universidad Tecnológica de Nezahualcóyotl. Es la interfaz de personal administrativo: padrón de empleados, alta y baja, semáforo de completitud documental, catálogos del sistema y ajustes de tema.

Qué **no** es:

- No es un portal de autoservicio para el empleado. No hay pantallas de solicitudes, recibos ni trámites personales.
- No contiene backend. Consume una API Laravel en un repositorio aparte (`http://localhost:8080/api` en desarrollo).
- No gestiona autorización de datos por sí mismo: el rol llega del backend y solo se usa para habilitar o esconder controles de edición.

## 2. Stack real

| Elemento | Valor | Fuente |
| --- | --- | --- |
| Framework | Angular `^22.2.0` (`@angular/core`, `common`, `forms`, `router`, `platform-browser`) | `package.json:21-26` |
| Build / CLI | `@angular/build` `^22.2.6`, `@angular/cli` `^22.2.6` | `package.json:31-32` |
| Componentes | standalone en toda la app (no hay `NgModule`) | `src/app/app.config.ts`, `angular.json` |
| Reactividad | signals (`signal`, `computed`, `effect`, `input`, `output`, `model`) y RxJS `~7.8.0` para HTTP y eventos del router | `package.json:27` |
| Estilos | SCSS con tokens en tres niveles; un único `src/styles/styles.scss` global | `angular.json:58-60` |
| Pruebas | Vitest `^5.0.0` + `jsdom` `^30.0.0`, builder `@angular/build:unit-test` | `package.json:36,42`, `angular.json:109-111` |
| Lint de estilos | Stylelint `^18.0.0` con `postcss-scss` | `package.json:38,40` |
| TypeScript | `~6.0.2` | `package.json:41` |
| Node | `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0` | `package.json:17-19` |
| Contenedor | multi-stage Node 22 Alpine → nginx 1.29 Alpine | `Dockerfile:6,28` |

La aplicación es **zoneless**: `zone.js` no aparece en `dependencies` ni en `devDependencies` (`package.json:20-43`), y `app.config.ts` no incluye `provideZoneChangeDetection`. El cambio de detección lo disparan las señales.

## 3. Arranque

`src/main.ts:5` llama a `bootstrapApplication(App, appConfig)`. `App` (`src/app/app.component.ts:11-16`) solo monta `<router-outlet />` y `<app-toast-container />`, de modo que un toast sobrevive a la navegación.

`src/app/app.config.ts:13-26` declara exactamente cuatro providers:

| Provider | Efecto |
| --- | --- |
| `provideBrowserGlobalErrorListeners()` | Reporta errores no controlados al manejador global del navegador |
| `provideRouter(routes)` | Router con la tabla de `app.routes.ts` |
| `provideHttpClient(withInterceptors([authInterceptor]))` | `HttpClient` con el interceptor funcional que adjunta el Bearer |
| `provideAppInitializer(() => { inject(ThemeService); })` | Instancia `ThemeService` en el arranque para que `data-theme` se escriba desde el primer render |

No hay `provideClientHydration`, ni SSR, ni service worker. El tema inicial además se aplica antes del primer paint con un script inline en `src/index.html:23-33`, porque el atributo estático es `data-theme="light"` (`src/index.html:2`).

## 4. Capas y dirección de dependencias

| Capa | Ruta | Responsabilidad | Regla |
| --- | --- | --- | --- |
| `core` | `src/app/core/` | Servicios sin vista: auth, http, layout, theme, y un servicio por contrato del backend | No importa de `features/` ni de `layout/` |
| `layout` | `src/app/layout/` | Shell autenticado: `AppShell`, `Sidebar`, `Topbar` | Importa `core` y `shared/ui`; no importa `features/` |
| `shared/ui` | `src/app/shared/ui/` | Primitivas sin dominio: botón, tabla, drawer, modal, toast, paginación, logos | No importa `core` de dominio ni `features/` |
| `features` | `src/app/features/` | Pantallas; componen `shared/ui` y consumen `core` | No importa otras `features/` salvo reutilizar un drawer puntual (`semaforo` usa `EditarDrawer` de `empleados`) |

La dirección real es `features → shared/ui → (nada)` y `features → core`. **No hay herramienta que verifique esta frontera**: no existe regla de ESLint ni de dependency-cruiser en el repositorio; el único control automático de capas es Stylelint, que solo vigila valores de estilo. La frontera se sostiene por convención y por revisión.

Excepciones reales al modelo: `layout/sidebar/sidebar.component.ts` inyecta `AuthService` directamente para pintar la credencial y ejecutar el logout, y `features/semaforo/semaforo-page.component.ts:23` importa un componente de `features/empleados/`.

## 5. Routing

`src/app/app.routes.ts` se evalúa una sola vez; `devRoutes` se construye condicionalmente sobre `!environment.produccion` (`app.routes.ts:11`). Todas las pantallas se cargan con `loadComponent`.

| Ruta | Componente | Guard | Notas |
| --- | --- | --- | --- |
| `login` | `LoginPage` | `guestGuard` | Fuera del shell |
| `` (raíz) | `AppShell` | `authGuard` | Contenedor de todo lo autenticado |
| `''` | `DashboardPage` | — | `data.breadcrumb: 'Panel general'` (`app.routes.ts:43`) |
| `empleados` | `EmpleadosPage` | — | Listado único: los tres estatus viven en sus pestañas. Último paso del breadcrumb por `?estatus=` |
| `empleados/activos` (`pathMatch: full`) | — | — | `redirectTo: 'empleados'` (dirección antigua) |
| `empleados/baja` (`pathMatch: full`) | — | — | `redirectTo: 'empleados'` (dirección antigua) |
| `empleados/alta` (`pathMatch: full`) | — | — | `redirectTo: 'empleados'` (dirección antigua) |
| `empleados/:id/editar` (`pathMatch: full`) | — | — | `redirectTo: 'empleados'` (dirección antigua) |
| `semaforo-documentos` | `SemaforoPage` | — | Breadcrumb `Semáforo de Completitud` |
| `admin/catalogos` | `CatalogosPage` | — | Ruta plana a propósito: el breadcrumb es un solo paso, `Catálogos` |
| `ajustes` | `AjustesPage` | — | Selector de tema |
| `tokens` | `TokenPreview` | — | Solo si `!environment.produccion` |
| `ui` | `UiKit` | — | Solo si `!environment.produccion` |
| `**` | — | — | `redirectTo: ''` |

Por qué las direcciones antiguas son redirecciones y no pantallas: el índice, el padrón y el listado de bajas eran tres rutas; hoy son **una** sola pantalla con cuatro pestañas. El alta y la edición viven en drawers montados sobre ella. Las redirecciones existen para que un marcador antiguo o un enlace externo aterrice en el listado en vez de en un 404, y conservan el query, así que `/empleados/activos?estatus=licencia` abre esa pestaña.

## 6. HTTP

Un único interceptor funcional, `src/app/core/http/auth.interceptor.ts:15-32`:

1. Lee el token de `TokenStorageService` y, si existe, clona la petición con `Authorization: Bearer <token>` (líneas 19-22).
2. En `catchError`, si la respuesta es `HttpErrorResponse` con `status === 401`, llama a `AuthService.limpiarSesionLocal()` y re-lanza el error (líneas 24-30).

No navega. La navegación queda deliberadamente fuera de alcance: el 401 limpia el token y la siguiente navegación protegida pasa por `authGuard`, que ya redirige a `/login`.

## 7. Entornos

| Archivo | `apiBaseUrl` | `produccion` | Se usa en |
| --- | --- | --- | --- |
| `src/environments/environment.ts` | `http://localhost:8080/api` | `false` | `ng serve` (configuración `development`) |
| `src/environments/environment.prod.ts` | `http://localhost:8080/api` | `true` | `ng build` (configuración `production`) |

`angular.json:62-69` declara el `fileReplacements` que intercambia el primero por el segundo en la configuración de producción. Como `serve` usa `development` (`angular.json:103-107`) y `build` usa `production` por defecto (`angular.json:95`), **el servidor de desarrollo lee siempre `environment.ts`** y el valor de `.env` nunca lo afecta.

`.env` es exclusivo de Docker Compose. Compose lo lee para tres variables (`docker-compose.yml:11,15,12`): `API_BASE_URL`, `APP_PORT` e `IMAGE_TAG`. `API_BASE_URL` viaja como `--build-arg` y el Dockerfile **reescribe** `src/environments/environment.prod.ts` dentro de la imagen (`Dockerfile:21`) antes de compilar. Consecuencia práctica: cambiar la URL de la API requiere reconstruir la imagen (`docker compose up --build`); no existe variable de runtime, porque Angular resuelve los entornos en tiempo de compilación. El `environment.prod.ts` versionado es solo el valor por defecto.

`produccion` no cambia el comportamiento de la app en runtime más allá de filtrar las rutas de desarrollo: se evalúa al cargar `app.routes.ts`.

## 8. Build y despliegue

Cadena local: `npm run prebuild` → `npm run lint:styles` (hook automático de `npm run build`, `package.json:7`), luego `ng build` (`package.json:8`). Un hexadecimal crudo en un componente rompe el build, no lo advierte.

Imagen Docker en dos etapas (`Dockerfile`):

1. `node:22-alpine`: `ARG API_BASE_URL` (línea 12), `npm ci`, copia del código, reescritura de `environment.prod.ts` (línea 21), `npm run build` (línea 23).
2. `nginx:1.29-alpine`: copia `docker/nginx.conf` y `dist/utn-rh/browser` a `/usr/share/nginx/html` (líneas 30-31), expone `80`, define `HEALTHCHECK` contra `/healthz` (líneas 35-36).

`docker/nginx.conf`:

| Comportamiento | Detalle |
| --- | --- |
| SPA fallback | `try_files $uri $uri/ /index.html` (línea 68) |
| `/healthz` | `return 200 "ok\n"`, sin access log (líneas 43-47) |
| Assets con hash | `Cache-Control: public, max-age=31536000, immutable` (línea 51) |
| `index.html` | `Cache-Control: no-store` (línea 60) |
| Cabeceras | `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy` (líneas 71-73) |
| gzip | activo para texto, JSON, SVG y woff2 (líneas 26-32) |

`docker-compose.yml` publica un solo servicio `web`, puerto `${APP_PORT:-4200}:80`, imagen `utn-rh-frontend:${IMAGE_TAG:-local}`, `restart: unless-stopped` y el mismo healthcheck.

## 9. Pruebas y calidad

- `npm test` → `ng test`, builder `@angular/build:unit-test` sobre Vitest (modo watch).
- `npm run verify` = `lint:styles && build && test --watch=false` (`package.json:13`). Es el comando de cierre obligatorio antes de publicar.
- Los `.spec.ts` viven junto al código. `tsconfig.spec.json` incluye `vitest/globals`.
- Presupuestos (`angular.json:70-86`): bundle inicial 500 kB warning / 1 MB error; `anyComponentStyle` 7 kB warning / 10 kB error.

Reglas de Stylelint (`stylelint.config.mjs`):

| Regla | Efecto |
| --- | --- |
| `color-no-hex` (línea 26) | Prohíbe hexadecimales |
| `function-disallowed-list: rgb, rgba, hsl, hsla` (línea 27) | Prohíbe funciones de color |
| `declaration-property-value-allowed-list` (líneas 29-36) | Exige `/^var\(--/` en `color`, `background`, `background-color`, `border-color`, `box-shadow`, `border-radius` |
| `declaration-property-value-disallowed-list` (líneas 38-41) | Prohíbe duraciones literales en `animation*` y `transition*` |
| Override `src/styles/tokens/**/*.scss` (líneas 43-54) | Desactiva las cuatro reglas: ahí los valores crudos son legales |

El comentario del propio archivo (líneas 19-21) aclara que `stylelint-declaration-strict-value` fue el plan original y se descartó porque el plugin 1.13 no registra su nombre bajo Stylelint 18.

## 10. Mapa de carpetas

```
src/
  main.ts                     # bootstrapApplication(App, appConfig)
  index.html                  # data-theme inicial + script que restaura el tema antes del paint
  styles/
    styles.scss               # tokens, base del documento, fondo del tema, anillo de foco global
    _breakpoints.scss         # $bp-lg 1199 / $bp-md 1023 / $bp-sm 767 / $bp-xs 479 + mixin down()
    tokens/                   # primitivos, tres temas, tipografía, movimiento, utilidades
  app/
    app.config.ts             # providers de la aplicación
    app.routes.ts             # tabla de rutas, guards y gating de rutas dev
    core/
      auth/                   # AuthService, TokenStorageService, authGuard, guestGuard, editarEmpleadoGuard
      http/                   # auth.interceptor.ts
      layout/                 # SidebarStateService
      theme/                  # ThemeService (único escritor de data-theme)
      dashboard/ padron/ empleados/ catalogos/ semaforo/   # un servicio por contrato del backend
      pagination/             # PaginatedBuffer, buffer de paginación reutilizable
    layout/
      app-shell/ sidebar/ topbar/   # shell autenticado
    shared/ui/                # alert-banner, animated-backdrop, brand-logos, button, data-table,
                              # drawer, kpi-card, modal, page-header, pagination,
                              # row-flag, row-link, status-pill, toast
    features/
      auth/                   # login-page, otp-input
      dashboard/ empleados/ semaforo/ admin/catalogos/ ajustes/
      dev/                    # token-preview, ui-kit (solo builds no productivos)
```

## Referencias

- `src/main.ts`
- `src/index.html`
- `src/app/app.component.ts`
- `src/app/app.config.ts`
- `src/app/app.routes.ts`
- `src/app/core/http/auth.interceptor.ts`
- `src/app/core/theme/theme.service.ts`
- `src/environments/environment.ts`, `src/environments/environment.prod.ts`
- `angular.json`, `package.json`, `stylelint.config.mjs`
- `Dockerfile`, `docker/nginx.conf`, `docker-compose.yml`, `.env.example`
- `src/styles/_breakpoints.scss`, `src/styles/tokens/`
