# US-08 — Editar empleado

El reporte técnico completo, compartido por ambos proyectos, está en:

[Reporte backend y frontend, matriz de campos, historial, migraciones, pruebas y pendientes](../../recursos_humanos_backoffice_backend/docs/us08-editar-empleado-reporte.md).

La edición vive en el drawer `editar-drawer`, abierto desde el lápiz del padrón; la ruta
`/empleados/:id/editar` es hoy un redirect a `/empleados/activos`. Solo Estado civil y los
campos de Estudios y experiencia son editables; Identificación restante y Plaza son de solo
lectura. El guard refleja E-04 y el backend aplica la validación definitiva. Se accede desde
la ficha del padrón o desde una acción independiente del drawer del semáforo.

Suite frontend completa: 404 pruebas aprobadas en 49 archivos. La revisión móvil no se pudo verificar con el viewport solicitado; la regresión backend tiene 18 casos fallidos preexistentes, comparados con HEAD original. Ver el reporte completo para evitar confundirlos con pruebas aprobadas.

Evidencias del registro controlado, sin credenciales:

- [Identificación protegida](evidence/us08/identificacion-readonly.jpg)
- [Plaza protegida](evidence/us08/plaza-readonly.jpg)
- [Edición e historial en light](evidence/us08/edicion-historial-light.jpg)
- [Edición e historial en guinda](evidence/us08/edicion-historial-guinda.jpg)
- [Edición e historial en dark](evidence/us08/edicion-historial-dark.jpg)

## Historial individual por campo

Implementado en Estado civil y los ocho campos de Estudios y experiencia. Consulta diferida, paginación por campo y valores legibles, conservando el historial general y los permisos existentes. El detalle técnico y el inventario de esta ampliación están en la sección K del reporte enlazado arriba.

Validación de esta ampliación: 33 pruebas backend con 239 aserciones en MariaDB aislada; npm run verify aprobado con 411 pruebas frontend en 50 archivos. Comprobado en escritorio con los temas light, guinda y dark. Móvil pendiente de verificación; los 18 fallos backend preexistentes no se presentan como resueltos. Sin nuevas migraciones en esta ampliación.

- [Estado civil](evidence/us08/historial-estado-civil-light.jpg)
- [Historial individual en light](evidence/us08/historial-individual-light.jpg)
- [Historial individual en guinda](evidence/us08/historial-individual-guinda.jpg)
- [Historial individual en dark](evidence/us08/historial-individual-dark.jpg)
