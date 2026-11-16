# Módulo: Panel general (dashboard)

## 1. Propósito

`/` es el panel general con **tres indicadores**: plantilla activa, cuentas dadas de baja y
expedientes completos. No lista registros; cada tarjeta abre una capa que explica la métrica y
ofrece el atajo a la pantalla que la desglosa.

| Pieza | Archivo |
| --- | --- |
| Ruta (hija del shell autenticado) | `src/app/app.routes.ts:41-46` |
| Pantalla | `src/app/features/dashboard/dashboard-page.component.ts` |
| Plantilla | `src/app/features/dashboard/dashboard-page.component.html` |
| Contratos | `src/app/core/dashboard/dashboard.models.ts` |
| Servicio | `src/app/core/dashboard/dashboard.service.ts` |
| Tarjeta KPI | `src/app/shared/ui/kpi-card/kpi-card.component.ts` |

## 2. Contrato `GET /dashboard/resumen`

`DashboardService.cargarResumen()` hace una sola lectura y desenvuelve el sobre: la pantalla recibe
`datos`, nunca `{ data }` (`src/app/core/dashboard/dashboard.service.ts:23-28`).

```http
GET /api/dashboard/resumen
Authorization: Bearer <sesión>
```

```json
{
  "datos": {
    "empleados_activos": 0,
    "empleados_baja": 0,
    "expedientes_completos": 0
  }
}
```

`ResumenDashboard` (`dashboard.models.ts:13-20`), envoltura en `:23-25`. Los nombres quedan en
`snake_case` a propósito: son el formato de cable y cada interfaz mapea 1:1.

| Campo | Definición según el contrato | Lo que cuenta |
| --- | --- | --- |
| `empleados_activos` | `activo = true AND fecha_baja IS NULL` | la plantilla vigente |
| `empleados_baja` | `activo = false` | las cuentas inactivas |
| `expedientes_completos` | activos cuyo expediente está completo | los quince campos vigentes llenos |

El servicio **no guarda estado**: la pantalla es dueña de `loading`, `error` y los datos, así que dos
pantallas que pidan el resumen cargan por separado (`dashboard.service.ts:7-16`).

## 3. El porcentaje se calcula en el cliente

La respuesta **no** trae porcentaje: manda conteos y la razón es una preocupación de presentación
(`dashboard.models.ts:8-10`). La fórmula implementada, tal cual
(`dashboard-page.component.ts:100-106`):

```ts
const resumen = this.resumen();
if (resumen === null || resumen.empleados_activos <= 0) return null;
return Math.round((resumen.expedientes_completos / resumen.empleados_activos) * 100);
```

Detalles que importan:

- Se redondea a porcentaje entero con `Math.round`.
- Con `empleados_activos === 0` devuelve `null`, no `0`: una división por cero no es "0 %". La
  interfaz imprime `Sin porcentaje` (`dashboard-page.component.ts:49-50, 120-126`).
- Con `resumen === null` (cargando o tras un fallo) devuelve `null` y la pista de la tarjeta
  desaparece en vez de adivinar (`:116-126`).
- La capa de la métrica reutiliza el mismo valor como texto (`:129-132`).

## 4. Las tres tarjetas

Render en `dashboard-page.component.html:46-74`; el contenedor declara
`aria-label="Indicadores del panel general"` y `aria-busy` mientras carga (`:41-45`).

| # | Etiqueta | `tone` | `icon` | Pista bajo la cifra | Al hacer clic |
| --- | --- | --- | --- | --- | --- |
| 1 | Empleados activos | `success` | `activos` | `Activos y sin fecha de baja` (fija) | abre la capa `Empleados activos` |
| 2 | Empleados baja | `danger` | `bajas` | `Cuentas inactivas` (fija) | abre la capa `Empleados baja` |
| 3 | Expedientes completos | `warning` | `semaforo` | `${porcentaje} % de los activos`, o `Sin porcentaje` | abre la capa `Expedientes completos` |

- `tone` decide el color de la franja del borde inicial y del glifo; `icon` dibuja uno de tres SVG de
  trazo (`kpi-card.component.ts:8-11`; glifos en `kpi-card.component.html:11-54`).
- La tarjeta entera es un `<button>` real cuando `clickable` está activo, con nombre accesible
  `${label}: ${value}` (`kpi-card.component.ts:46-53`, `kpi-card.component.html:65-73`). El clic
  burbujea al host; el padre lo escucha en `<app-kpi-card (click)>`.
- Los valores llegan ya formateados con `Intl.NumberFormat('es-MX')`; cuando no hay dato se imprime
  `—`, nunca `0`, porque cero es una respuesta real de la API
  (`dashboard-page.component.ts:44-47, 92-93, 108-114, 209-212`).

## 5. Capas que explican cada métrica

Las tres son `app-modal` y comparten patrón: un párrafo que define la métrica, un botón `Cancelar` y
un botón primario que navega. `ir(ruta)` cierra **todas** las capas antes de navegar, para que una
navegación bloqueada no deje un modal flotando (`dashboard-page.component.ts:165-175`).

| Capa | Texto que explica | Atajo |
| --- | --- | --- |
| Empleados activos (`html:78-90`) | Cuenta a los empleados con la cuenta activa y sin fecha de baja: la plantilla vigente. Los historiales, las adscripciones y las bajas no entran en esta cifra. | `Ir a empleados activos` → `/empleados` |
| Empleados baja (`html:92-102`) | Cuenta las cuentas inactivas. El historial de cada baja, con su fecha, su motivo y su archivo, vive en la pestaña de bajas definitivas del listado. | `Ir a empleados baja` → `/empleados?estatus=baja_definitiva` |
| Expedientes completos (`html:104-134`) | Cuenta a los empleados activos cuyo expediente está completo: los quince campos vigentes están llenos. Un empleado dado de baja no suma, y un expediente al que le falta un campo tampoco. | `Ir a semáforo de documentos` → `/semaforo-documentos` |

La tercera capa añade dos cifras en un `<dl>` —`Expedientes completos` y `Del total de activos`— y
una nota explícita: "El porcentaje lo calcula el panel a partir de las dos cifras del servidor; no
viene en la respuesta" (`dashboard-page.component.html:111-126`). Es la única capa con ese desglose;
su significado no es obvio desde la etiqueta (`dashboard-page.component.ts:58-62`).

> `Ir a empleados baja` apunta a `/empleados?estatus=baja_definitiva`: el mismo listado, abierto en
> esa pestaña. No hay una segunda pantalla de bajas.

## 6. Errores

`manejarError()` traduce el fallo a una frase y a **una** acción; cada situación tiene su propio
texto porque "algo salió mal" borraría la distinción (`dashboard-page.component.ts:14-41, 178-198`).

| Status | Mensaje | Acción ofrecida |
| --- | --- | --- |
| `401` | Tu sesión venció. Vuelve a iniciar sesión. | `Iniciar sesión`: limpia la sesión local y navega a `/login` |
| `403` | No tienes permisos para ver el panel. | ninguna: el `switch` de la plantilla no dibuja botón |
| `503` | El servicio no está disponible. Reintenta en unos segundos. | `Reintentar` → `cargar()` |
| otro, incluido `0` (red) | No pudimos conectar con el servidor. Revisa tu conexión. | `Reintentar` → `cargar()` |

- Antes de mapear se descarta el resumen anterior: cifras viejas se leerían como actuales
  (`:182-183`).
- `codigo` del cuerpo (`permiso_denegado`, `servicio_no_disponible`) se muestra junto al mensaje,
  sin traducir (`:200-207`; `dashboard.models.ts:27-36`; banner en `html:17-35`).
- `cargar()` es idempotente mientras hay una petición en vuelo y es también el reintento del aviso
  (`:138-157`).
- El botón `Actualizar` del encabezado llama al mismo `cargar()` y se deshabilita mientras carga
  (`html:12-14`).

## 7. Ruta de aterrizaje después del login

`/` es el destino por defecto cuando el backend no pide otra ruta. En
`src/app/features/auth/login-page/login-page.component.ts:159-160`:

```ts
const destino = this.auth.redirect() ?? '/';
void this.router.navigateByUrl(destino === '' ? '/' : destino);
```

`auth.redirect()` es el `redirect` que devolvió `POST /auth/otp/verificar`
(`src/app/core/auth/auth.service.ts:36-38, 63-67`). Por lo tanto:

| `auth.redirect()` | Destino |
| --- | --- |
| `null` | `/` → panel general |
| `''` | `/` → panel general |
| una ruta | esa ruta |

El panel es la hija `path: ''` del shell autenticado, con `data.breadcrumb: 'Panel general'`
(`src/app/app.routes.ts:41-46`), y es la entrada `Dashboard` del menú, con
`routerLinkActiveOptions: { exact: true }` para que no quede activa en rutas anidadas
(`src/app/layout/sidebar/sidebar.component.html:108-143`).

## 8. Ciclo de carga

1. El constructor llama a `cargar()` una vez (`dashboard-page.component.ts:134-136`).
2. `loading` en `true`, `error` en `null`, y `finalize` lo apaga con la petición cerrada
   (`:144-152`).
3. Mientras carga, la región se anuncia ocupada y las tres cifras son `—`
   (`dashboard-page.component.html:41-45`).
4. Al responder, `resumen` se fija y las tres tarjetas, la pista del porcentaje y la capa de detalle
   se recalculan por señales (`:154`; `:100-132`).

## Referencias

- `src/app/app.routes.ts`
- `src/app/core/dashboard/dashboard.models.ts`
- `src/app/core/dashboard/dashboard.service.ts`
- `src/app/core/dashboard/dashboard.service.spec.ts`
- `src/app/features/dashboard/dashboard-page.component.ts`
- `src/app/features/dashboard/dashboard-page.component.html`
- `src/app/features/dashboard/dashboard-page.component.spec.ts`
- `src/app/features/auth/login-page/login-page.component.ts`
- `src/app/core/auth/auth.service.ts`
- `src/app/shared/ui/kpi-card/kpi-card.component.ts`
- `src/app/shared/ui/kpi-card/kpi-card.component.html`
- `src/app/shared/ui/modal/modal.component.ts`
- `src/app/layout/sidebar/sidebar.component.html`
