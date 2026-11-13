# US-11 — Frontend del semáforo de completitud

Fecha: 2026-11-12. Rama de ambos repositorios: `feature/semaforo_completitud`.
Alcance implementado: consulta del listado y del detalle de faltantes, pasos 1–3.

## A. Diagnóstico inicial

El frontend usa Angular 22, componentes standalone, signals, RxJS, SCSS, rutas lazy y un shell autenticado. Ya existían el menú y la ruta `/semaforo-documentos`, pero cargaban una pantalla pendiente. Se reutilizaron el interceptor Bearer, los guards, Button, DataTable, Drawer y los tokens de los tres temas. No se agregaron dependencias.

El backend ya disponía de `GET /api/semaforo` y `GET /api/semaforo/{id}/faltantes`, protegidos por autenticación, usuario activo y E-08. La consulta sigue dependiendo de esa autorización del servidor. El frontend no crea permisos ni intenta sustituirla. Ambos repositorios estaban limpios al iniciar; no se modificaron archivos del backend.

## B. Implementación visual

La pantalla respeta el diseño actual del proyecto y conserva exactamente estas cinco columnas: No., Nombre, Adscripción, Plaza y Campos faltantes. El estado del expediente no ocupa una columna: se dibuja como una franja en el borde inicial de la fila, con una oración equivalente para lectores de pantalla. Adscripción usa `area.nombre`; Plaza usa `puesto.nombre`. Los valores ausentes tienen texto explícito. La única acción implementada es **Ver faltantes**.

Los estados se distinguen por texto e iconos además del color. Se utilizaron tokens semánticos, sin modificar la paleta global. El amarillo usa texto principal con borde e icono de advertencia: el texto blanco sobre el amarillo del tema claro no alcanzaba contraste suficiente para texto pequeño. Los controles de orden tienen `aria-sort`, los filtros `aria-pressed`, los campos tienen etiquetas y la tabla conserva su desplazamiento horizontal en anchuras reducidas.

El detalle reutiliza el dialog nativo del Drawer compartido: apertura por teclado, cierre con Escape y recuperación del foco del botón original comprobados en navegador. Muestra identidad mínima, estado, porcentaje, resumen y etiquetas de faltantes; no muestra los valores personales de esos campos. No hay botones de correo ni edición.

## C. Archivos creados y modificados

Rutas relativas a este repositorio:

| Archivo | Cambio |
| --- | --- |
| `src/app/app.routes.ts` | Sustituye el placeholder por la ruta lazy del semáforo. |
| `src/app/core/semaforo/semaforo.models.ts` | Contratos tipados reales; reutiliza tipos existentes de estado y paginación. |
| `src/app/core/semaforo/semaforo.service.ts` | Consultas HTTP de listado y faltantes. |
| `src/app/core/semaforo/semaforo.service.spec.ts` | Cuatro pruebas del contrato HTTP. |
| `src/app/features/semaforo/semaforo-page.component.ts` | Estado, consultas, filtros, debounce, cancelación, orden y paginación. |
| `src/app/features/semaforo/semaforo-page.component.html` | Tabla, filtros, estados de carga/error/vacío y paginador. |
| `src/app/features/semaforo/semaforo-page.component.scss` | Estilos locales con tokens. |
| `src/app/features/semaforo/semaforo-page.component.spec.ts` | Veintiuna pruebas de la pantalla. |
| `src/app/features/semaforo/faltantes-drawer.component.ts` | Carga del detalle y manejo de errores/cancelación. |
| `src/app/features/semaforo/faltantes-drawer.component.html` | Resumen y etiquetas del servidor. |
| `src/app/features/semaforo/faltantes-drawer.component.scss` | Estilos locales del detalle. |
| `src/app/features/semaforo/faltantes-drawer.component.spec.ts` | Seis pruebas del detalle. |
| `src/app/features/semaforo/estado-expediente.component.ts` | Badge con texto e iconos SVG. |
| `src/app/features/semaforo/estado-expediente.component.scss` | Estados mediante tokens. |
| `src/app/shared/ui/data-table/data-table.component.ts` | Ordenamiento opcional y etiqueta opcional de acciones. |
| `src/app/shared/ui/data-table/data-table.component.html` | Cabeceras ordenables accesibles, optativas. |
| `src/app/shared/ui/data-table/data-table.component.scss` | Controles de cabecera con tokens. |
| `docs/us11-semaforo-frontend-reporte.md` | Este informe. |
| `docs/evidence/us11/*.jpg` | Seis capturas locales de la integración. |

El comportamiento anterior de DataTable queda como valor predeterminado; sus ocho pruebas anteriores siguen pasando.

## D. Integración real

Frontend: `http://localhost:4200/semaforo-documentos`. API: `http://localhost:8080/api`.

```http
GET /api/semaforo?pagina=1&por_pagina=25&ordenar_por=num_empleado&direccion=asc
Authorization: Bearer <sesión existente>

GET /api/semaforo?buscar=<número o nombre>&estado=casi_completo&pagina=1&por_pagina=10&ordenar_por=nombre&direccion=asc

GET /api/semaforo/{id}/faltantes
```

El listado consume `datos`, `contadores`, `meta` y `enlaces`; el detalle consume `datos.empleado` y `datos.semaforo.detalle_faltantes` con `campo` y `etiqueta`. Estado, porcentaje, faltantes y total obligatorio vienen del backend. No se reproduce la fórmula ni la lista de 19 campos en el cliente.

Los contadores se presentan tal como los calcula el servidor sobre el universo autorizado y la búsqueda, antes del filtro de estado y la página. Se conservan búsqueda, estado y orden al paginar. Cambiar filtros, búsqueda, orden o tamaño devuelve a la primera página. Tamaños: 10, 25, 50 y 100; inicial: 25. Orden permitido: `num_empleado`, `nombre`, `estado`, `campos_faltantes`.

La búsqueda espera 300 ms. `switchMap` cancela solicitudes superadas tanto del listado como del detalle; se limpia el detalle al cambiar de trabajador o cerrar. Se evitan solicitudes idénticas involuntarias. Se corrige la página si desaparecen sus resultados, incluso cuando el total llega a cero. Hay textos seguros para 401, 403, 404 del detalle, 429 del listado, errores de red y servidor; no se imprimen trazas recibidas. 401 utiliza el manejo de sesión existente.

## E. Pruebas ejecutadas

### Automatizadas de frontend en Docker

```powershell
docker build --target build -t utn-rh-frontend-check:us11 .
docker run --rm -v "${PWD}/src:/app/src" utn-rh-frontend-check:us11 npm test -- --watch=false
docker run --rm -v "${PWD}/src:/app/src" utn-rh-frontend-check:us11 npm run build
git diff --check
```

Resultado final: **36 archivos, 274 pruebas aprobadas**, salida 0. Son 31 pruebas nuevas y 243 anteriores. La última ejecución completa terminó a las 19:57 UTC. Stylelint y compilación de producción aprobaron, sin errores de presupuesto. El build ejecuta `prebuild` y por ello también valida SCSS.

Las pruebas nuevas comprueban contrato y parámetros HTTP, cinco columnas, estados, contadores del servidor, búsqueda por nombre/número con debounce, filtros combinados, orden, paginación, selector inicial, carga, vacío, errores, reintento, ausencia de valores sensibles y acciones fuera del alcance, respuesta completa sin faltantes y cancelación de solicitudes. Se corrigieron durante la verificación la selección inicial del tamaño y el caso de última página cuando desaparecen todos los resultados; ambos tienen regresión automatizada.

Estas pruebas usan HttpTestingController/datos controlados en memoria. No ejecutan suites Laravel ni modifican la base de desarrollo. Son distintas de las pruebas backend anteriores en la base aislada.

### Navegador y backend local con datos existentes

Se inició sesión mediante el flujo OTP existente y se abrió la ruta desde el menú. Las peticiones reales del navegador llegaron al backend desde el origen `http://localhost:4200` y devolvieron 200. La comprobación CORS OPTIONS devolvió 204 con autorización de `authorization`. Una cancelación rápida produjo 499 en el proxy, coherente con cancelar una petición superada.

Se contrastaron los contadores con una consulta de lectura a Eloquent en el contenedor app, sobre empleados activos y sus 19 campos. La conexión efectiva reportó `APP_ENV=local`, host `db`, base `rh_sistema`. No se modificaron expedientes, usuarios, permisos ni credenciales.

| Caso real | Resultado observado | Estado |
| --- | --- | --- |
| Acceso autenticado y listado | 425 activos; cinco columnas y detalle disponible | Aprobado |
| Contadores | 0 completos + 231 casi completos + 194 incompletos = 425; coinciden con la lectura de BD | Aprobado |
| Filtro casi completo | Filas del estado seleccionado; total filtrado 231, contadores generales conservados | Aprobado |
| Búsqueda por número combinada con estado | Un resultado; contadores del universo buscado iguales a uno | Aprobado |
| Búsqueda por nombre combinada con estado | Siete resultados para la búsqueda seleccionada | Aprobado |
| Paginación | Tamaño 10: segunda página muestra 11–20 de 425, página 2 de 43 | Aprobado |
| Orden por nombre | Solicitud del servidor, cabecera ascendente y reinicio a página 1 | Aprobado |
| Filtro completos sin registros | Estado vacío; contadores generales conservados | Aprobado |
| Detalle incompleto | 4 faltantes, 15 completos, 19 obligatorios, 78.95%; etiquetas sin valores | Aprobado |
| Teclado | Enter abre, Escape cierra y devuelve foco | Aprobado |
| Temas | Tabla en claro, guinda y oscuro; detalle en claro y oscuro | Aprobado |
| Anchura reducida | Viewport observado 662 px; página sin desborde horizontal, tabla con scroll propio | Aprobado |
| Expediente completo real | No existe ninguno en los datos actuales; cubierto solo con respuesta controlada en pruebas | No verificado en BD real |
| Errores 401/403/404/500 reales | No se alteraron cuentas ni datos para provocarlos; cubiertos por pruebas de frontend | No verificado en integración real |

La revisión visual se hizo en el navegador integrado. El acceso de automatización a Chrome nativo no fue aprobado; no se atribuyen resultados a ese navegador ni a un dispositivo móvil físico.

## F. Docker

Se conservaron los servicios del backend `app`, `queue`, `db` y `mailpit`. El frontend usa el servicio `web`, contenedor `utn-rh-web`, imagen `utn-rh-frontend:local` y Nginx en el puerto 4200. El bundle se compiló con la API local en 8080.

```powershell
docker compose up -d --build web
```

Se reconstruyó únicamente el frontend para comprobar los cambios servidos. No se ejecutaron migraciones, seeders, vaciados ni eliminación de volúmenes. No hubo pull, merge, commit ni push. El backend conserva el árbol de trabajo limpio.

## G. Pendientes y alcance final

El frontend de consulta de los pasos 1–3 está implementado e integrado con el backend local. Permanecen fuera del alcance los pasos 4 y 5: envío de correo y edición de expedientes. No se implementaron sus botones, servicios ni endpoints. Tampoco se implementaron nuevos flujos alternativos del documento. No se declara terminada toda la US-11.

## H. Evidencia visual

Las capturas contienen los nombres visibles del entorno local; tratarlas como documentación interna. No incluyen tokens, OTP, contraseñas ni valores de los campos faltantes.

- [Tabla en claro](evidence/us11/semaforo-light.jpg)
- [Tabla en guinda](evidence/us11/semaforo-guinda.jpg)
- [Tabla en oscuro](evidence/us11/semaforo-dark.jpg)
- [Detalle en claro](evidence/us11/drawer-light.jpg)
- [Detalle en oscuro](evidence/us11/drawer-dark.jpg)
- [Vista de anchura reducida](evidence/us11/semaforo-pequeno.jpg)
