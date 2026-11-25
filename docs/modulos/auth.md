# Módulo de autenticación

Acceso sin contraseña en dos pasos (correo institucional + código de un solo uso) y sesión por Bearer token sobre Sanctum. Este documento describe el estado real de `core/auth/*` y `features/auth/*`, incluidos dos hechos que el código deja visibles: el guard de edición no está conectado a la tabla de rutas y la caducidad de 10 minutos solo existe como texto en la interfaz.

## 1. Archivos del módulo

| Archivo | Contenido |
| --- | --- |
| `src/app/core/auth/auth.models.ts` | Interfaces del wire format (snake_case) y el sobre de error compartido |
| `src/app/core/auth/auth.service.ts` | Estado de sesión y las cuatro llamadas HTTP |
| `src/app/core/auth/token-storage.service.ts` | Persistencia del token en `sessionStorage` con respaldo en memoria |
| `src/app/core/auth/auth.guard.ts` | `authGuard` y `guestGuard` |
| `src/app/core/auth/editar-empleado.guard.ts` | `puedeEditarEmpleado` y `editarEmpleadoGuard` |
| `src/app/features/auth/login-page/login-page.component.*` | Pantalla de dos pasos |
| `src/app/features/auth/otp-input/otp-input.component.*` | Entrada de 6 casillas |

## 2. Contratos HTTP reales

La base es `${environment.apiBaseUrl}/auth` (`auth.service.ts:26`).

| Verbo | Ruta | Cuerpo | Respuesta | Fuente |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/otp` | `correo: string` | `message: string` | `auth.service.ts:47-50`, `auth.models.ts:10-17` |
| `POST` | `/auth/otp/verificar` | `correo: string`, `codigo: string` | `token`, `tipo: 'Bearer'`, `rol`, `modulo`, `redirect`, `expira_en` | `auth.service.ts:58-69`, `auth.models.ts:20-34` |
| `GET` | `/auth/sesion` | — | `usuario_id`, `empleado_id`, `nombre`, `rol` | `auth.service.ts:72-76`, `auth.models.ts:37-42` |
| `POST` | `/auth/logout` | `{}` | `unknown` (el cuerpo no se usa) | `auth.service.ts:84-88` |

Sobre de error compartido, `ApiErrorResponse` (`auth.models.ts:45-51`): `message`, `intentos_restantes?` (que el comentario ubica en el `422` de `/auth/otp/verificar`) y `reintentar_en_segundos?` (que ubica en los `429`).

## 3. Estado expuesto por `AuthService`

| Miembro | Tipo | Qué expone |
| --- | --- | --- |
| `token` | `Signal<string \| null>` | Token en memoria; se inicializa leyendo del storage (`auth.service.ts:28-30`) |
| `sesion` | `Signal<SesionResponse \| null>` | Última identidad cargada; arranca en `null` en cada carga de página |
| `redirect` | `Signal<string \| null>` | Ruta que pidió el backend en la última verificación exitosa (`auth.service.ts:36-38`) |
| `estaAutenticado` | `computed<boolean>` | `token() !== null`, sin validar vigencia (`auth.service.ts:41`) |
| `rol` | `computed<string \| null>` | `sesion()?.rol ?? null` (`auth.service.ts:44`) |

Los signals son la fuente de verdad de la interfaz. El token se espeja en `TokenStorageService` solo para sobrevivir una recarga; las plantillas leen `token()`, `sesion()`, `rol()` y `estaAutenticado()`, nunca el storage.

Los signals no tienen un único escritor, y conviene saberlo antes de tocar el servicio:

| Signal | Lo escriben |
| --- | --- |
| `_token` | `verificarCodigo` (`auth.service.ts:65`), `limpiarSesionLocal` (`:93`) |
| `_redirect` | `verificarCodigo` (`:66`) |
| `_sesion` | `cargarSesion` (`:75`), `limpiarSesionLocal` (`:94`) |

`verificarCodigo` escribe token y redirect, pero **no** la sesión: esa la carga `cargarSesion` aparte. `cerrarSesion` limpia el estado local en `finalize`, de modo que un logout rechazado también expulsa al usuario (`auth.service.ts:84-88`).

## 4. Flujo completo

1. **Solicitar código.** `LoginPage.enviarCorreo()` (`login-page.component.ts:113-137`) valida `puedeEnviarCorreo()`, recorta el correo, limpia el error y llama a `solicitarCodigo`. En éxito: borra el código previo, cambia `paso` a `'codigo'` y arranca la cuenta de 30 s.
2. **Verificar.** `enviarCodigo()` (`login-page.component.ts:139-165`) exige `puedeVerificar()` (6 dígitos y sin petición en curso).
3. **Guardar token.** `AuthService.verificarCodigo` escribe el token en `TokenStorageService`, actualiza `_token` y guarda el `redirect` del backend.
4. **Cargar sesión.** El login **no** llama a `cargarSesion()`. Lo hace `authGuard` al entrar al shell (`auth.guard.ts:26-33`), porque la identidad se necesita antes de renderizar sidebar y topbar.
5. **Redirigir.** `verificado` se pone en `true` para mostrar el checkmark; tras 700 ms se navega a `auth.redirect() ?? '/'`, y un valor vacío se resuelve como `/` (`login-page.component.ts:154-162`).

La cuenta atrás (`iniciarCuenta`, líneas 233-248) usa `setInterval` de 1 s, se detiene al llegar a 0 y se limpia en `DestroyRef.onDestroy` junto con el timer de navegación (líneas 99-107).

## 5. Token

| Aspecto | Implementación |
| --- | --- |
| Clave | `utn-rh.token` (`token-storage.service.ts:3`) |
| Almacén | `sessionStorage`: muere con la pestaña |
| Respaldo | Campo `memoryToken` en el servicio |
| Fallo de storage | Toda lectura y escritura va en `try/catch`; un fallo degrada al respaldo en memoria y nunca se propaga al llamador (`token-storage.service.ts:18-46`) |

La elección de `sessionStorage` está documentada en el propio archivo (líneas 6-11): el token no debe sobrevivir al cierre de la pestaña, y el modo privado o las cookies bloqueadas pueden lanzar excepción. Por eso existe el respaldo en memoria: la sesión funciona aunque no se pueda persistir, a costa de perderse al recargar.

## 6. Guards

### `authGuard` (`auth.guard.ts:13-34`)

1. `token() === null` → `router.navigate(['/login'])`, devuelve `false`.
2. `sesion() !== null` → `true` sin petición.
3. En otro caso llama a `cargarSesion()`: éxito → `true`; error → `limpiarSesionLocal()`, navega a `/login` y devuelve `false`.

El token por sí solo no basta: la identidad se carga antes de que el shell se renderice.

### `guestGuard` (`auth.guard.ts:40-50`)

`token() === null` → `true`. Con token presente navega a `/` y devuelve `false`. El destino es `/` y no `redirect()` porque esa ruta solo se conoce inmediatamente después de una verificación.

### `puedeEditarEmpleado` y `editarEmpleadoGuard`

```ts
// editar-empleado.guard.ts:6-7
export const puedeEditarEmpleado = (rol: string | null): boolean =>
  rol !== null && ['ADMIN', 'SUPER_ADMIN', 'SISTEMAS'].includes(rol);
```

`editarEmpleadoGuard` (líneas 9-11) devuelve `true` o un `UrlTree` hacia `/empleados`.

**Este guard no está conectado a `app.routes.ts`.** No aparece en ningún `canActivate` de la tabla de rutas. El predicado se consume inline, como `computed`:

- `empleados-page.component.ts:130` → `readonly puedeEditar = computed(() => puedeEditarEmpleado(this.auth.rol()));`
- `semaforo-page.component.ts:86` → la misma expresión.

El efecto es que el rol esconde o muestra el botón de edición dentro de las páginas; no bloquea una ruta. Las rutas `/empleados/:id/editar` y `/empleados/alta` ya son redirecciones a `activos`, así que hoy no existe URL que proteger.

## 7. UI

### `LoginPage`

- Host con `data-theme="light"` fijo (`login-page.component.ts:34`): el login siempre se pinta en claro, con independencia del tema guardado.
- Dos pasos en un solo componente mediante `paso: signal<'correo' | 'codigo'>`.
- Placeholder de ejemplo `nombre@correo-institucional` (`login-page.component.html:126`).
- El error se pinta en un único bloque `.err` con `role="alert"` y una ✕ decorativa (`login-page.component.html:91-96`).
- Botón principal con `aria-busy` durante la petición y estado de éxito con checkmark antes de navegar.
- El texto "El código es de un solo uso y caduca en 10 minutos" (`login-page.component.html:157`) es copy de interfaz: no hay temporizador de caducidad ni validación en el cliente.

### `OtpInput`

Seis casillas de un carácter (`otp-input.component.ts:12`). El componente es dueño de los dígitos y emite la cadena unida por `valueChanges`; no hay formulario reactivo detrás.

| Interacción | Comportamiento | Línea |
| --- | --- | --- |
| Escribir | Conserva solo dígitos; con más de uno reparte la cadena desde la casilla actual; avanza el foco salvo que se haya llenado la última | 73-91 |
| Carácter no numérico | Se descarta en silencio y se limpia el valor pintado | 77-83 |
| Backspace en casilla vacía | Borra la anterior y mueve el foco a ella | 95-102 |
| ← / → | Mueven el foco con límites en 0 y 5 | 104-113 |
| Pegar | Toma solo dígitos; si la cadena trae 6 o más, llena desde la primera casilla sin importar dónde se pegó | 117-130 |

Props: `isInvalid` (borde de error y vibración) y `disabled` (bloquea las seis casillas). Los ids se generan con un contador de módulo (`otp-input.component.ts:18,52`), sin aleatoriedad, para que dos instancias no colisionen.

### Reenvío y cambio de correo

- Enlace "Reenviar código" oculto mientras `segundos() > 0`; el texto muestra `mm:ss` y una barra que avanza con `scaleX` (`login-page.component.html:178-197`).
- "Cambiar correo" detiene la cuenta, pone `segundos` en 0, borra código y error, y vuelve al paso 1 (`login-page.component.ts:190-198`).

## 8. Errores y códigos

`manejarError` (`login-page.component.ts:200-231`) es la única traducción de status a interfaz:

| Status | Qué muestra |
| --- | --- |
| `0` | `MENSAJE_SIN_CONEXION` ("No pudimos conectar con el servidor…") |
| `422` y `403` | `message` del backend, más ` Intentos restantes: N.` si `intentos_restantes` es numérico |
| `429` | `message` del backend o `MENSAJE_SIN_CONEXION`; reinicia la cuenta atrás con `reintentar_en_segundos` si es numérico y mayor que 0; en otro caso con 30 s |
| Cualquier otro | `MENSAJE_SIN_CONEXION` |

`422` y `403` comparten rama a propósito (línea 217). El mensaje del backend se usa tal cual cuando es texto; no se reescribe en el cliente.

## Referencias

- `src/app/core/auth/auth.models.ts`
- `src/app/core/auth/auth.service.ts`
- `src/app/core/auth/token-storage.service.ts`
- `src/app/core/auth/auth.guard.ts`
- `src/app/core/auth/editar-empleado.guard.ts`
- `src/app/core/http/auth.interceptor.ts`
- `src/app/features/auth/login-page/login-page.component.ts`
- `src/app/features/auth/login-page/login-page.component.html`
- `src/app/features/auth/otp-input/otp-input.component.ts`
- `src/app/features/auth/otp-input/otp-input.component.html`
- `src/app/features/empleados/empleados-page.component.ts`
- `src/app/features/semaforo/semaforo-page.component.ts`
