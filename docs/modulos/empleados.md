# Módulo de empleados

El expediente del trabajador y las cuatro operaciones que lo tocan: consultar la ficha, dar de alta, editar y dar de baja. Este documento describe el estado real de `core/empleados/*` y `features/empleados/*` en la rama `develop`.

Dos hechos que el código deja visibles y que conviene leer primero:

1. **Alta y edición ya no son rutas.** `/empleados/alta` y `/empleados/:id/editar` solo existen como `redirectTo: 'activos'` para no romper enlaces viejos (`app.routes.ts:70-85`). Las dos operaciones son drawers montados por la pantalla.
2. **Los sobres de respuesta no son uniformes.** `GET /empleados/{id}`, `PATCH /empleados/{id}`, `GET /empleados/{id}/historial-bajas` y `GET /catalogos/motivos-baja` llegan envueltos en `data`; `GET /empleados/formulario`, `POST /empleados` y `POST /empleados/{id}/baja` llegan en la raíz del cuerpo. La diferencia está comentada en cada servicio y es la causa de bugs reales cuando se copia un patrón de un endpoint a otro.

## 1. Archivos del módulo

| Archivo | Contenido |
| --- | --- |
| `src/app/core/empleados/alta.models.ts` | Catálogos del formulario, `AltaEmpleadoRequest`, `EmpleadoRegistrado`, `ErrorValidacion` |
| `src/app/core/empleados/alta.service.ts` | `GET /empleados/formulario`, `POST /empleados` |
| `src/app/core/empleados/ficha.models.ts` | `FichaEmpleado` por bloques, historial de bajas, errores |
| `src/app/core/empleados/ficha.service.ts` | `GET /empleados/{id}`, `GET /empleados/{id}/historial-bajas` |
| `src/app/core/empleados/editar.service.ts` | Allowlist `CAMPOS_EDITABLES`, `CAMPOS_CON_HISTORIAL`, `PATCH`, historial por campo |
| `src/app/core/empleados/baja.models.ts` | Motivos, cuerpo y respuesta de la baja, sobre de error |
| `src/app/core/empleados/baja.service.ts` | `GET /catalogos/motivos-baja`, `POST /empleados/{id}/baja` |
| `src/app/core/empleados/validacion.ts` | Funciones puras de validación, espejo de las reglas del backend |
| `src/app/core/empleados/borrador-alta.ts` | Borrador, evaluación por sección, cuerpo del alta, derivaciones |
| `src/app/core/empleados/expediente-campos.ts` | Etiquetas en español de los campos faltantes del expediente |
| `src/app/core/empleados/entidades-federativas.ts` | Tabla RENAPO congelada (33 claves) mientras el endpoint no la envía |
| `src/app/features/empleados/*` | Pantalla de padrón, drawers de ficha, alta y edición |

## 2. Rutas y montaje de los drawers

| Ruta | Hoy | Fuente |
| --- | --- | --- |
| `/empleados` | Listado único con pestañas por estatus (`EmpleadosPage`) | `app.routes.ts` |
| `/empleados/activos` | `redirectTo: 'empleados'` | `app.routes.ts` |
| `/empleados/baja` | `redirectTo: 'empleados'` | `app.routes.ts` |
| `/empleados/alta` | `redirectTo: 'empleados'` | `app.routes.ts` |
| `/empleados/:id/editar` | `redirectTo: 'empleados'` | `app.routes.ts` |

| Drawer | Se monta en | Se abre desde |
| --- | --- | --- |
| `AltaDrawer` | `empleados-page.component.html:293` | Botón «Nuevo empleado» del encabezado (`empleados-page.component.html:23`, `page.component.ts:585-587`) |
| `FichaDrawer` | `empleados-page.component.html:285-291` y `semaforo-page.component.html:220-227` | Clic en la fila, o botón del nombre (`page.component.ts:544-564`) |
| `EditarDrawer` | `empleados-page.component.html:300-304` y `semaforo-page.component.html:229-233` | Lápiz de la ficha (`ficha-drawer.component.html:35-41` → `page.component.ts:139-143`) |

El alta se monta **solo** en el padrón; el semáforo no tiene alta. La edición se monta en ambas pantallas y comparte el mismo componente, que nunca navega ni hace toast: emite `actualizado` y la página decide qué recargar (`editar-drawer.component.ts:148-170`).

## 3. Contratos HTTP

Base: `${environment.apiBaseUrl}` = `http://localhost:8080/api` (`environments/environment.ts:8`).

### 3.1 `AltaService`

| Verbo | Ruta | Cuerpo | Respuesta | Sobre |
| --- | --- | --- | --- | --- |
| `GET` | `/empleados/formulario` | — | `FormularioCatalogos` (`areas`, `puestos`, `categorias_cct`, `niveles_estudios`, `estados_civiles`, `tipos_personal`, `sexos`, `entidades?`, `tipos_jornada`, `trabaja_otro_lugar`) | Raíz (`alta.service.ts:33-35`, `alta.models.ts:84-103`) |
| `POST` | `/empleados` | `AltaEmpleadoRequest` | `EmpleadoRegistrado` (`id`, `num_empleado`, `nombre`, `correo_institucional?`, `activo?`), `201` | Raíz (`alta.service.ts:42-44`, `alta.models.ts:121-182`) |

### 3.2 `FichaService`

| Verbo | Ruta | Respuesta | Sobre |
| --- | --- | --- | --- |
| `GET` | `/empleados/{id}` | `FichaEmpleado` | `data` (se desenvuelve en el servicio, `ficha.service.ts:34-38`) |
| `GET` | `/empleados/{id}/historial-bajas` | `HistorialBaja[]` | `data` (`ficha.service.ts:44-48`) |

### 3.3 `EditarEmpleadoService`

| Verbo | Ruta | Cuerpo / parámetros | Respuesta | Sobre |
| --- | --- | --- | --- | --- |
| `GET` | `/empleados/{id}` | — | `FichaEmpleadoResponse` | `data`; **no** se desenvuelve aquí (`editar.service.ts:64-66`) |
| `PATCH` | `/empleados/{id}` | `EdicionEmpleado` (solo allowlist) | `FichaEmpleadoResponse` | `data`; el drawer lee `respuesta.data` (`editar.service.ts:67-69`, `editar-drawer.component.ts:705`) |
| `GET` | `/empleados/{id}/informacion-historial` | `campo`, `pagina`, `por_pagina=5` | `HistoriaCampo { datos, meta }` | Raíz, no `data` (`editar.service.ts:70-74`, `editar.service.ts:55-58`) |

### 3.4 `BajaService`

| Verbo | Ruta | Cuerpo | Respuesta | Sobre |
| --- | --- | --- | --- | --- |
| `GET` | `/catalogos/motivos-baja` | — | `MotivoBaja[]` (`id`, `clave`, `descripcion`) | `data`, desenvuelto en el servicio (`baja.service.ts:39-43`) |
| `POST` | `/empleados/{id}/baja` | `{ motivo_id, nota }` | `{ mensaje, empleado }` | Raíz (`baja.service.ts:50-58`, `baja.models.ts:31-56`) |

El error de la baja habla dos dialectos: `409` y `500` traen `mensaje`; `401` y `422` traen el `message` de Laravel (`baja.models.ts:58-74`).

## 4. Alta

### 4.1 Cuatro pestañas

`identificacion`, `plaza`, `formacion`, `revision` (`alta-drawer.component.ts:127-132`). La navegación es libre: una pestaña con errores se abre igual y la insignia dice cuántos campos faltan (`alta-drawer.component.ts:471-491`). El índice de cada pestaña coincide con la **sección** que declara `SECCION_DE_CAMPO` (`borrador-alta.ts:169-192`), de modo que un campo y su pestaña no pueden discrepar.

### 4.2 Flujo del borrador

| Paso | Función | Efecto |
| --- | --- | --- |
| Escritura | `guardar(campo, valor)` (`alta-drawer.component.ts:670-682`) | Actualiza `modelo`, olvida el `422` de ese campo y recalcula mensajes |
| CURP | `derivarBorrador(datos, curp, ctx)` (`borrador-alta.ts:531-549`) | Escribe `entidad_nacimiento`, `fecha_nacimiento` y `sexo` en **cada** pasada, `''` incluido |
| Evaluación | `evaluarBorrador(datos, ctx, opciones)` (`borrador-alta.ts:380-425`) | Devuelve `Record<campo, mensaje>` recorriendo el borrador completo |
| Cuerpo | `construirCuerpoAlta(datos, ctx, derivados)` (`borrador-alta.ts:460-515`) | Envía solo lo lleno; omite opcionales vacíos |
| Envío | `registrar()` (`alta-drawer.component.ts:858-884`) | Bloquea doble envío y no gasta un viaje en un error ya conocido |

`derivarBorrador` limpia en vez de conservar: si la CURP deja de ser válida, la fecha y el sexo vuelven a `''` porque los tres campos están bloqueados y un valor superviviente sería un dato que el usuario no puede corregir (`borrador-alta.ts:517-530`).

### 4.3 Derivaciones que sorprenden

| Regla | Implementación |
| --- | --- |
| La categoría CCT **no** se envía: se lee del puesto (`puestos.categoria_cct_id`) y el servidor la deriva | `categoriaDePuesto` (`borrador-alta.ts:255-264`), `AltaEmpleadoRequest` no tiene el campo (`alta.models.ts:106-120`) |
| Un puesto de categoría `mando_medio_superior` fija `tipo_personal = 'No Aplica'` y `tipo_jornada = 'Mixta'`; los dos controles se ocultan y el evaluador deja de pedirlos | `esMandoMedioDe` (`borrador-alta.ts:290-292`), `tipoPersonalDe` / `tipoJornadaDe` (`300-307`), constantes en `102-109`, guarda en `411-414` |
| `trabaja_otro_donde` se **borra** al volver a `trabaja_otro_lugar = 'No'` y no viaja en el cuerpo | `alta-drawer.component.ts:781-787`, `borrador-alta.ts:509-512` |
| El correo pide solo la parte local; el dominio `utn.edu.mx` se anexa al escribir y al enviar | `GUARDAR_CORREO` (`alta-drawer.component.ts:704-710`), `correoConDominio` (`validacion.ts:380-383`) |
| Una fecha de nacimiento derivada de una CURP válida no se valida otra vez | `derivaFecha` (`borrador-alta.ts:319-322`, uso en `400-402`) |
| `entidad_nacimiento` solo viaja si la clave existe en el catálogo; si no, se envía `''` | `claveDeEntidad` (`borrador-alta.ts:273-281`) |
| El selector de puestos se filtra por `area_ids` del área elegida; cambiar de área borra un puesto que ya no pertenece | `puestos` (`alta-drawer.component.ts:373-381`), `cambiarArea` (`765-772`) |

### 4.4 Errores por pestaña y `422`

`erroresPorTab` suma los fallos locales y los del último `422`, deduplicados por campo, y los agrupa con `SECCION_DE_CAMPO` (`alta-drawer.component.ts:471-491`). Un `422` escribe `erroresServidor`, guarda el `message` general y salta a la primera clave que tenga pestaña (`alta-drawer.component.ts:913-921`, `944-951`). Los mensajes de un campo fuera de toda pestaña no se descartan: se listan en `erroresSueltos` (`alta-drawer.component.ts:500-504`). El mensaje del servidor gana sobre el local (`errorDe`, `800-806`).

## 5. Validación (`validacion.ts`)

Todas las funciones devuelven `null` cuando el valor es aceptable o la frase que lee el usuario. La CURP es la excepción: el backend colapsa cinco fallos en una sola frase y el cliente no inventa una segunda opinión (`validacion.ts:18-42`, `26-27`).

| Regla | Implementación | Límite / mensaje |
| --- | --- | --- |
| CURP vacía es válida (campo opcional) | `validarCurp` (`271-298`) | — |
| CURP: longitud 18 | `validarCurp` (`277-279`) | «La CURP no es válida. Revisa el formato, la entidad y el dígito verificador.» |
| CURP: patrón oficial | `PATRON` (`73`) | Mismo mensaje |
| CURP: entidad federativa existente (33 claves + `NE`) | `ENTIDADES` (`64-66`) | Mismo mensaje |
| CURP: fecha real y no futura; siglo por homoclave (dígito → 1900, letra → 2000) | `curpFechaNacimiento` (`203-223`) | Mismo mensaje |
| CURP: dígito verificador con tabla que incluye `Ñ` | `calcularDigitoVerificador` (`177-193`), `TABLA` (`50-54`) | Mismo mensaje |
| Número de empleado: obligatorio, ≤ 20 | `validarNumEmpleado` (`301-310`) | 20 |
| Nombre: obligatorio, ≤ 150 | `validarNombre` (`313-322`) | 150 |
| Correo: obligatorio, formato, ≤ 150 y dominio exacto `utn.edu.mx` comparado sin distinguir mayúsculas | `validarCorreo` (`332-351`), `DOMINIO_INSTITUCIONAL` (`99`) | 150; `LARGO_MAXIMO_LOCAL = 139` (`112`) |
| Fecha `YYYY-MM-DD` real; opción `noFutura` | `validarFecha` (`404-426`) | — |
| Inicio del puesto ≥ ingreso al gobierno (solo si ambas existen) | `validarInicioPuesto` (`434-445`) | — |
| Generación `AAAA-AAAA`, fin ≥ inicio | `validarGeneracion` (`448-462`) | — |
| Años de experiencia: entero 0–100 | `validarAniosExperiencia` (`465-473`) | 100 |
| Largo de texto opcional, medido con `trim()` | `validarLargo` (`476-481`) | Escuela 100, observaciones 2000, otro lugar 255 |
| `trabaja_otro_donde`: prohibido con `No`, requerido con `Publico`/`Privado` | `trabajaOtroDondeRequerido` (`489-500`) | — |

`evaluarBorrador` escribe **un mensaje por campo** (`poner`, `borrador-alta.ts:387-391`). Los límites de caracteres viven en el modelo del alta y no en un segundo lugar (`alta.models.ts:123-167`). El cliente es un espejo, no la autoridad: un valor rechazado aquí lo sería allá con las mismas palabras (`validacion.ts:1-11`).

## 6. Edición

| Aspecto | Valor |
| --- | --- |
| Allowlist de 9 campos | `estado_civil_id`, `nivel_estudios_id`, `escuela_procedencia`, `generacion`, `exp_publico_anios`, `exp_privado_anios`, `trabaja_otro_lugar`, `trabaja_otro_donde`, `observaciones` (`editar.service.ts:7-17`) |
| Campos con historial consultable (3) | `nivel_estudios_id`, `escuela_procedencia`, `generacion` (`editar.service.ts:31-36`) |
| Cuerpo del `PATCH` | Solo la allowlist; texto vacío viaja como `null` (`editar-drawer.component.ts:548-556`) |
| Campos fuera de la allowlist | Solo lectura: el borrador los conserva para que las reglas lean el expediente completo, pero `guardar()` los rechaza y `evaluarBorrador` recibe `camposProtegidos` para no reclamarlos (`editar-drawer.component.ts:290-292`, `569-577`, `301-305`) |

Que un campo no esté en la allowlist significa dos cosas a la vez: no hay control para escribirlo y **no se envía** en el `PATCH`. Nombre, CURP, área, puesto y fechas no forman parte del cuerpo (`editar-drawer.component.ts:540-556`). El historial es de solo lectura y por campo; el endpoint responde `422` a cualquier `campo` que no sea uno de los tres, por eso el componente se tipa contra la unión (`editar.service.ts:21-36`, `historial-campo.component.ts:22-35`).

## 7. Ficha

`FichaEmpleado` se agrupa en seis bloques (`ficha.models.ts:137-146`):

| Bloque | Campos principales |
| --- | --- |
| `identificacion` | `num_empleado`, `nombre`, `curp`, `fecha_nacimiento`, `sexo`, `estado_civil`, `entidad_nacimiento` (`13-29`) |
| `plaza` | `area`, `puesto`, `tipo_puesto`, `categoria_cct_clave`, `tipo_personal`, `tipo_jornada`, tres fechas y `antiguedad.texto` (`44-65`) |
| `contacto` | `correo_institucional` (`68-70`) |
| `estudios` | `nivel_estudios`, `escuela_procedencia`, `generacion` (`73-80`) |
| `experiencia` | años público/privado, `trabaja_otro_lugar`, `trabaja_otro_donde` (`83-89`) |
| `gestion_interna` | `activo`, `fecha_baja`, `motivo_baja`, `nota_baja`, `observaciones`, `estado_expediente` (`126-134`) |

**Modelo de completitud.** El backend envía `estado` (`completo | casi_completo | incompleto`), `total_faltantes` y `campos_faltantes` (`ficha.models.ts:96-104`). El porcentaje y los conteos no vienen en la ficha: los calcula la lista del semáforo y viajan como `ResumenCompletitud`; desde el padrón el input queda `null` (`ficha.models.ts:106-123`, `ficha-drawer.component.ts:237-247`). Cada clave faltante se mapea a una caja y a una pestaña; una clave desconocida se lista en español pero no marca ninguna caja (`ficha-drawer.component.ts:119-130`, `392-448`). Las etiquetas vienen de `etiquetaCampoExpediente` (`expediente-campos.ts:7-49`).

**Historial de bajas.** La ficha carga `GET /empleados/{id}/historial-bajas` junto con el expediente. La lista no se imprime en la hoja: la usa el sello de `Estado` para distinguir licencia de baja definitiva y es el cuerpo del anexo (`ficha-drawer.component.ts:269-288`, `1024-1032`). El tipo es `licencia | definitiva` (`ficha.models.ts:168-185`).

## 8. Baja

| Aspecto | Valor |
| --- | --- |
| Catálogo | `GET /catalogos/motivos-baja`; solo se ofrecen dos claves (`ficha-panel.component.ts:67-68`, `220-223`) |
| Claves válidas | `BAJA_DEFINITIVA` y `BAJA_TEMPORAL`; cualquier otra se oculta (`ficha-panel.component.ts:59-68`) |
| Cuerpo | Exactamente `{ motivo_id, nota }`; la fecha y el actor son del servidor (`baja.models.ts:24-36`) |
| Nota | Máximo 1000 caracteres, recortada antes de enviar (`ficha-panel.component.ts:53-54`, `383-412`) |
| Éxito | `200` con `mensaje` y `empleado`; el panel avisa al drawer y el drawer a la pantalla para recargar (`ficha-panel.component.ts:407-409`, `ficha-drawer.component.ts:701-712`) |
| Conflictos | `409` = ya está de baja; `404` = el trabajador ya no existe (`ficha-panel.component.ts:48-51`) |

## 9. Permisos

`puedeEditarEmpleado(rol)` es verdadero solo para `ADMIN`, `SUPER_ADMIN` y `SISTEMAS` (`core/auth/editar-empleado.guard.ts:6-7`). Se evalúa en el padrón y en el semáforo con `computed(() => puedeEditarEmpleado(this.auth.rol()))` (`empleados-page.component.ts:130`, `semaforo-page.component.ts:86`) y se pasa a `FichaDrawer` como `[puedeEditar]`; el lápiz solo se pinta con ese permiso y `ficha() !== null` (`ficha-drawer.component.html:35-41`). No hay guard de ruta que lo respalde: `editarEmpleadoGuard` existe (`editar-empleado.guard.ts:9-11`) pero **no** está conectado en `app.routes.ts`, porque la edición dejó de ser una ruta. La autorización real es del servidor; el cliente solo evita ofrecer la acción.

## 10. Drawers

| Componente | Responsabilidad |
| --- | --- |
| `FichaDrawer` | Monta el expediente, sus cuatro pestañas, el sello y el anexo; pide la ficha y el historial, mapea errores y emite `editarSolicitado` / `bajaRegistrada` |
| `FichaPanel` | Segundo nivel sobre la ficha; cuatro destinos `VistaFicha`: `historial-bajas`, `baja`, `reactivacion`, `adscripciones` (`ficha-panel.component.ts:24-31`) |
| `EditarDrawer` | Tres pestañas; precarga el borrador desde la ficha, envía la allowlist y emite `actualizado` |
| `HistorialCampo` | Lista de solo lectura de los valores previos de los tres campos con historial; carga diferida al abrir el `details` |
| `AltaDrawer` | Cuatro pestañas, catálogos, borrador y envío del alta; emite `registrado` |
| `AltaExpediente` | Presentación compartida de la hoja con pestañas, usada por alta y edición |
| `AltaRevision` | Resumen de solo lectura del alta agrupado en tres secciones (`alta-drawer.component.ts:507-565`) |

## Referencias

- `src/app/core/empleados/alta.models.ts`
- `src/app/core/empleados/alta.service.ts`
- `src/app/core/empleados/ficha.models.ts`
- `src/app/core/empleados/ficha.service.ts`
- `src/app/core/empleados/editar.service.ts`
- `src/app/core/empleados/baja.models.ts`
- `src/app/core/empleados/baja.service.ts`
- `src/app/core/empleados/validacion.ts`
- `src/app/core/empleados/borrador-alta.ts`
- `src/app/core/empleados/expediente-campos.ts`
- `src/app/core/empleados/entidades-federativas.ts`
- `src/app/features/empleados/empleados-page.component.ts`
- `src/app/features/empleados/alta-drawer/alta-drawer.component.ts`
- `src/app/features/empleados/ficha-drawer/ficha-drawer.component.ts`
- `src/app/features/empleados/ficha-drawer/ficha-panel/ficha-panel.component.ts`
- `src/app/features/empleados/editar-drawer/editar-drawer.component.ts`
- `src/app/features/empleados/editar-drawer/historial-campo/historial-campo.component.ts`
- `src/app/app.routes.ts`
- `src/app/core/auth/editar-empleado.guard.ts`
