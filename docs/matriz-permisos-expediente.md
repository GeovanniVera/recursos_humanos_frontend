# Matriz de permisos del expediente

Configuración que el backend necesita para que las tres pantallas que abren el
mismo expediente se comporten igual. El frontend **no** replica esta matriz: no
crea permisos ni sustituye la autorización del servidor. Lo único que hace es
mostrar la frase que el backend devuelve cuando niega.

## 1. Las tres entradas, y por qué comparten drawer

| Pantalla | Ruta | Para qué existe | Capacidad |
|---|---|---|---|
| Padrón (activos y bajas) | `/empleados/activos` | Quién está y quién se fue | `E-01` lista, `E-12` búsqueda |
| Semáforo de completitud | `/semaforo-documentos` | Quién debe documentos, entre los activos | `E-08` |
| Expediente (drawer) | — | El trabajador, visto desde cualquiera de las dos | `E-02` |
| Edición (drawer) | — | Corregir estado civil, estudios y experiencia | `E-04` |

El drawer es el mismo componente en las dos páginas. Eso significa que **quien
puede abrir una fila tiene que poder leer el expediente**: si el rol lista pero
no lee, la fila abre un panel que el servidor niega.

## 2. Roles conocidos

Jerarquía vigente, según `requerimiento-16-us-05`:

| Rol | Posición | Hereda de |
|---|---|---|
| `SECRETARIA`, `SECRETARIA_CIRCULARES` | Analista de RRHH | — |
| `ADMIN` | Administrador de RRHH | — |
| `SUPER_ADMIN` | Superadministrador | `ADMIN` |
| `SISTEMAS` | Sistemas | `SUPER_ADMIN` |

`E-04` hoy se resuelve en el cliente con exactamente `ADMIN`, `SUPER_ADMIN` y
`SISTEMAS` (`core/auth/editar-empleado.guard.ts`), que coincide con la jerarquía
de arriba: los dos últimos heredan del primero.

## 3. Endpoint por endpoint

Leyenda de estado: **confirmado** = documentado en el repo; **a confirmar** = el
código existe pero el repo no fija qué capacidad lo protege.

| Endpoint | Capacidad | Estado | Quién lo llama |
|---|---|---|---|
| `GET /api/padron` | `E-01` (+ `E-12` si hay búsqueda) | confirmado | Padrón |
| `GET /api/semaforo` | `E-08` | confirmado | Semáforo |
| `GET /api/empleados/{id}` | `E-02` | confirmado | Expediente (ambas páginas) y edición |
| `GET /api/empleados/{id}/historial-bajas` | `E-02` | a confirmar | Pestaña Estado del expediente |
| `GET /api/empleados/{id}/informacion-historial` | `E-04` | confirmado | Panel de nivel de estudios en edición |
| `PATCH /api/empleados/{id}` | `E-04` | confirmado | Drawer de edición |
| `GET /api/empleados/formulario` | alta | a confirmar (`E-03`) | Drawer de alta y de edición |
| `POST /api/empleados` | alta | a confirmar (`E-03`) | Drawer de alta |
| `GET /api/catalogos/motivos-baja` | baja | a confirmar | Formato de baja |
| `POST /api/empleados/{id}/baja` | baja | a confirmar (`E-05`) | Formato de baja |
| `GET /api/semaforo/{id}/faltantes` | `E-08` | confirmado | **Ya nadie**: el expediente lo reemplazó |

El repo lista `E-03`, `E-05`, `E-06` y `E-07` juntas como "alta, baja o
reactivación de empleados" sin decir cuál es cuál. Por eso esas filas quedan como
*a confirmar*: asignar el código equivocado daría un `403` en producción.

## 4. El hueco que hay que cerrar

Hoy un rol con `E-08` y sin `E-02` puede listar el semáforo y **no** puede abrir
la fila. Antes no se notaba porque la fila abría
`GET /api/semaforo/{id}/faltantes`, que exige la misma capacidad que la lista.

Configuración recomendada, una de dos:

**Opción A — el semáforo también lee el expediente (recomendada).**
Agregar `E-02` a los mismos roles que ya tienen `E-08`. El semáforo es una vista
de diagnóstico del mismo trabajador; impedir la lectura es una inconsistencia de
la matriz, no una defensa.

**Opción B — el semáforo no abre el expediente.**
Quitar la acción de la fila para los roles sin `E-02`. Barato, pero deja una
lista en la que no se puede profundizar.

Si se elige B, el frontend necesita algo que hoy no tiene: saber qué capacidades
trae la sesión. `GET /api/auth/sesion` devuelve `rol` y nada más, así que el
cliente tendría que derivar el mapa —justo lo que este documento evita—. La
salida limpia sería que la sesión exponga `capacidades: string[]`.

## 5. Política de errores

Ya está implementada en el cliente y no hay que cambiar nada:

| Situación | Respuesta | Lo que ve el usuario |
|---|---|---|
| Sin token | `401` | Vuelve al login |
| Rol sin la capacidad | `403` + `codigo: permiso_denegado` | La frase del backend, y el código como detalle |
| Registro fuera del alcance del rol | `404` opaco (política US-04 / EX-06) | "No encontramos ese trabajador." |

El `404` en lugar de `403` para los registros fuera de alcance es deliberado:
impide enumerar por prueba de existencia.

## 6. Cambios concretos en el backend

1. Agregar `E-02` a los roles que tienen `E-08` (opción A).
2. Confirmar qué capacidad protege `POST /empleados/{id}/baja` y
   `GET /catalogos/motivos-baja`, y si `GET /empleados/{id}/historial-bajas`
   comparte `E-02` con la ficha.
3. Retirar la ruta `GET /api/semaforo/{id}/faltantes`: el frontend ya no la llama.

## 7. Verificación

- [ ] Un usuario `SECRETARIA` abre el semáforo y puede abrir una fila.
- [ ] El mismo usuario ve el expediente completo y **no** ve el lápiz.
- [ ] Un usuario `ADMIN` ve el lápiz, guarda, y el `PATCH` responde `200`.
- [ ] Un usuario con `E-08` y sin `E-02` recibe `403` con `permiso_denegado` al
      pedir `/empleados/{id}` — y solo si se eligió la opción B, además no ve la
      acción de la fila.
- [ ] Un registro fuera del alcance del rol responde `404`, no `403`.
- [ ] Ninguna pantalla llama ya a `/semaforo/{id}/faltantes`.
