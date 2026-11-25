import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import {
  EmpleadoElegibleItem,
  PermisoCatalogoItem,
  PermisoRolPayload,
  RolAdminItem,
  UsuarioAdminItem,
} from '../../../core/admin/usuarios.models';
import { UsuariosAdminService } from '../../../core/admin/usuarios.service';
import { AlertBanner } from '../../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../../shared/ui/button/button.component';
import {
  DataTable,
  TableColumn,
  TableDensity,
  TableRow,
} from '../../../shared/ui/data-table/data-table.component';
import { RowFlag, RowFlagTone } from '../../../shared/ui/row-flag/row-flag.component';

type TabAdmin = 'usuarios' | 'roles';
type FiltroEstadoUsuario = 'todos' | 'activos' | 'suspendidos';

interface GrupoPermisos {
  recurso: string;
  titulo: string;
  permisos: PermisoCatalogoItem[];
}

interface UsuarioTablaFila extends TableRow {
  id: number;
  num_empleado: string;
  nombre: string;
  correo: string;
  area: string;
  rol: string;
  estado: string;
  acciones: string;
  raw: UsuarioAdminItem;
}

const TITULOS_MODULO: Readonly<Record<string, string>> = {
  acceso: 'Acceso al sistema (OTP)',
  empleados: 'Expediente y personal',
  comunicados: 'Comunicación interna',
  catalogos: 'Catálogos y reglas CCT',
  usuarios: 'Cuentas de usuario',
  roles: 'Roles y responsabilidades',
  bitacora: 'Auditoría y bitácora',
  dashboard: 'Panel principal',
};

const ETIQUETAS_ALCANCE: Readonly<Record<string, string>> = {
  todos: 'Todos los registros',
  por_area: 'Solo su área',
  propio: 'Solo su propio registro',
  destinatario: 'Solo recibidos',
  agregado: 'Solo totales',
  no_aplica: 'Acceso general',
};

const NIVELES_SUGERIDOS = [
  { nivel: 15, etiqueta: 'Básico — Consulta y operación de área (Nivel 15)' },
  { nivel: 30, etiqueta: 'Operativo — Gestión parcial o auditoría (Nivel 30)' },
  { nivel: 50, etiqueta: 'Administrativo — Gestión completa de personal (Nivel 50)' },
  { nivel: 70, etiqueta: 'Avanzado — Supervisión y autorizaciones (Nivel 70)' },
] as const;

const DENSIDADES: readonly { id: TableDensity; label: string }[] = [
  { id: 'compact', label: 'Compacta' },
  { id: 'standard', label: 'Estándar' },
  { id: 'comfortable', label: 'Amplia' },
];

const COLUMNAS_USUARIOS: readonly TableColumn[] = [
  { key: 'num_empleado', header: 'Núm. empleado', width: '150px' },
  { key: 'nombre', header: 'Colaborador' },
  { key: 'area', header: 'Área' },
  { key: 'rol', header: 'Rol asignado', width: '210px' },
  { key: 'estado', header: 'Estado', width: '140px' },
  { key: 'acciones', header: 'Acciones', width: '140px' },
];

@Component({
  selector: 'app-usuarios-page',
  standalone: true,
  imports: [FormsModule, AlertBanner, Button, DataTable, RowFlag],
  templateUrl: './usuarios-page.component.html',
  styleUrl: './usuarios-page.component.scss',
})
export class UsuariosPage implements OnInit {
  private readonly service = inject(UsuariosAdminService);
  private readonly auth = inject(AuthService);

  readonly columnas = COLUMNAS_USUARIOS;
  readonly densidades = DENSIDADES;
  readonly densidad = signal<TableDensity>('standard');

  readonly tab = signal<TabAdmin>('usuarios');
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);

  // Usuarios
  readonly usuarios = signal<UsuarioAdminItem[]>([]);
  readonly buscarUsuario = signal('');
  readonly filtroRolId = signal<number | null>(null);
  readonly filtroActivo = signal<FiltroEstadoUsuario>('todos');

  // Alta de usuario
  readonly altaAbierta = signal(false);
  readonly terminoElegible = signal('');
  readonly elegibles = signal<EmpleadoElegibleItem[]>([]);
  readonly elegibleSeleccionado = signal<EmpleadoElegibleItem | null>(null);
  readonly listaElegiblesAbierta = signal(false);
  readonly buscandoElegibles = signal(false);
  readonly indiceElegibleActivo = signal(-1);
  readonly rolNuevoUsuarioId = signal<number | null>(null);
  readonly guardandoUsuario = signal(false);
  private timerElegible: ReturnType<typeof setTimeout> | null = null;

  // Roles y permisos
  readonly roles = signal<RolAdminItem[]>([]);
  readonly catalogoPermisos = signal<PermisoCatalogoItem[]>([]);
  readonly rolSeleccionadoId = signal<number | null>(null);
  readonly seleccionPermisos = signal<Record<number, string>>({});
  readonly buscarPermiso = signal('');
  readonly guardandoPermisos = signal(false);

  // Nuevo rol
  readonly nuevoRolAbierto = signal(false);
  readonly nuevoRolNombre = signal('');
  readonly nuevoRolDescripcion = signal('');
  readonly nuevoRolNivel = signal(30);
  readonly guardandoRol = signal(false);

  readonly puedeCrearUsuario = computed(
    () => this.auth.permisos().size === 0 || this.auth.tienePermiso('usuarios.crear'),
  );
  readonly puedeEditarUsuario = computed(
    () => this.auth.permisos().size === 0 || this.auth.tienePermiso('usuarios.editar'),
  );
  readonly puedeCambiarEstado = computed(
    () => this.auth.permisos().size === 0 || this.auth.tienePermiso('usuarios.cambiar_estado'),
  );
  readonly puedeGestionarRoles = computed(
    () => this.auth.permisos().size === 0 || this.auth.tienePermiso('roles.gestionar'),
  );

  readonly filas = computed<UsuarioTablaFila[]>(() =>
    this.usuarios().map((u) => ({
      id: u.id,
      num_empleado: u.empleado.num_empleado ?? '—',
      nombre: u.empleado.nombre ?? 'Sin nombre',
      correo: u.empleado.correo ?? '',
      area: u.empleado.area ?? '—',
      rol: u.rol?.nombre ?? 'Sin rol',
      estado: u.activo ? 'Activo' : 'Suspendido',
      acciones: '',
      raw: u,
    })),
  );

  readonly rolesAsignables = computed(() =>
    this.roles().filter((r) => r.activo && r.editable),
  );

  readonly nivelesDisponibles = computed(() => {
    const maxNivelEditable = Math.max(
      0,
      ...this.roles()
        .filter((r) => r.editable)
        .map((r) => r.nivel),
    );
    const filtrados = NIVELES_SUGERIDOS.filter((n) => n.nivel <= Math.max(maxNivelEditable, 70));
    return filtrados.length > 0 ? filtrados : NIVELES_SUGERIDOS.slice(0, 1);
  });

  readonly rolSeleccionado = computed(
    () => this.roles().find((r) => r.id === this.rolSeleccionadoId()) ?? null,
  );

  readonly totalPermisosActivos = computed(() => Object.keys(this.seleccionPermisos()).length);

  readonly gruposPermisos = computed<GrupoPermisos[]>(() => {
    const termino = this.buscarPermiso().trim().toLowerCase();
    const mapa = new Map<string, PermisoCatalogoItem[]>();

    for (const p of this.catalogoPermisos()) {
      const tituloModulo = (TITULOS_MODULO[p.recurso] ?? p.recurso).toLowerCase();
      if (
        termino !== '' &&
        !p.descripcion.toLowerCase().includes(termino) &&
        !tituloModulo.includes(termino)
      ) {
        continue;
      }

      const lista = mapa.get(p.recurso) ?? [];
      lista.push(p);
      mapa.set(p.recurso, lista);
    }

    return Array.from(mapa.entries()).map(([recurso, permisos]) => ({
      recurso,
      titulo: TITULOS_MODULO[recurso] ?? recurso,
      permisos,
    }));
  });

  readonly claveGeneradaNuevoRol = computed(() =>
    this.nuevoRolNombre()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40),
  );

  ngOnInit(): void {
    this.cargarTodo();
  }

  cargarTodo(): void {
    this.cargando.set(true);
    this.error.set(null);

    const activoParam =
      this.filtroActivo() === 'todos' ? null : this.filtroActivo() === 'activos';

    this.service
      .listarUsuarios({
        buscar: this.buscarUsuario(),
        rol_id: this.filtroRolId(),
        activo: activoParam,
      })
      .subscribe({
        next: (res) => {
          this.usuarios.set(res.datos);
          this.cargando.set(false);
        },
        error: () => {
          this.error.set('No se pudo cargar el listado de usuarios.');
          this.cargando.set(false);
        },
      });

    this.service.listarRoles().subscribe({
      next: (res) => {
        this.roles.set(res.datos);
        if (this.rolSeleccionadoId() === null && res.datos.length > 0) {
          this.seleccionarRol(res.datos[0]);
        }
      },
    });

    if (this.puedeGestionarRoles()) {
      this.service.listarPermisos().subscribe({
        next: (res) => this.catalogoPermisos.set(res.datos),
      });
    }
  }

  filtrarEstado(estado: FiltroEstadoUsuario): void {
    this.filtroActivo.set(estado);
    this.cargarTodo();
  }

  aplicarFiltros(): void {
    this.cargarTodo();
  }

  tonoDe(fila: TableRow): RowFlagTone {
    const item = (fila as UsuarioTablaFila).raw;
    return item.activo ? 'activo' : 'baja';
  }

  etiquetaAlcance(alcance: string): string {
    return ETIQUETAS_ALCANCE[alcance] ?? alcance;
  }

  alcancesElegibles(permiso: PermisoCatalogoItem): string[] {
    return permiso.alcances_soportados.filter((a) => a !== 'no_aplica');
  }

  grupoTieneTodos(grupo: GrupoPermisos): boolean {
    const asignables = grupo.permisos.filter((p) => p.asignable);
    if (asignables.length === 0) return false;
    const sel = this.seleccionPermisos();
    return asignables.every((p) => sel[p.id] !== undefined);
  }

  toggleGrupo(grupo: GrupoPermisos, activar: boolean): void {
    this.seleccionPermisos.update((actual) => {
      const copia = { ...actual };
      for (const p of grupo.permisos) {
        if (!p.asignable) continue;
        if (activar) {
          if (copia[p.id] === undefined) {
            copia[p.id] = p.alcances_soportados[0] ?? 'no_aplica';
          }
        } else {
          delete copia[p.id];
        }
      }
      return copia;
    });
  }

  alNavegarTabs(event: KeyboardEvent): void {
    const tabs: readonly TabAdmin[] = this.puedeGestionarRoles()
      ? ['usuarios', 'roles']
      : ['usuarios'];
    if (tabs.length <= 1) return;

    const current = tabs.indexOf(this.tab());
    let next = current;

    switch (event.key) {
      case 'ArrowRight':
        next = (current + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (current - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.tab.set(tabs[next]);
    const list = event.currentTarget as HTMLElement | null;
    list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  abrirAlta(): void {
    this.tab.set('usuarios');
    this.altaAbierta.set(true);
    this.exito.set(null);
    this.error.set(null);
    this.elegibleSeleccionado.set(null);
    this.terminoElegible.set('');
    this.listaElegiblesAbierta.set(false);
    this.indiceElegibleActivo.set(-1);
    this.rolNuevoUsuarioId.set(this.rolesAsignables()[0]?.id ?? null);
    this.buscarEmpleadosElegibles();
    setTimeout(() => document.getElementById('buscar-elegible')?.focus());
  }

  cerrarAlta(): void {
    this.altaAbierta.set(false);
    this.listaElegiblesAbierta.set(false);
    this.indiceElegibleActivo.set(-1);
    setTimeout(() => document.getElementById('btn-nueva-cuenta')?.focus());
  }

  toggleNuevoRol(): void {
    if (this.nuevoRolAbierto()) {
      this.cerrarNuevoRol();
      return;
    }
    this.nuevoRolAbierto.set(true);
    setTimeout(() => document.getElementById('nuevo-rol-nombre')?.focus());
  }

  cerrarNuevoRol(): void {
    this.nuevoRolAbierto.set(false);
    setTimeout(() => document.getElementById('btn-nuevo-rol')?.focus());
  }

  alTeclearCombobox(event: KeyboardEvent): void {
    const lista = this.elegibles();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.listaElegiblesAbierta()) {
          this.listaElegiblesAbierta.set(true);
        }
        if (lista.length > 0) {
          this.indiceElegibleActivo.update((i) => (i + 1) % lista.length);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.listaElegiblesAbierta()) {
          this.listaElegiblesAbierta.set(true);
        }
        if (lista.length > 0) {
          this.indiceElegibleActivo.update((i) => (i <= 0 ? lista.length - 1 : i - 1));
        }
        break;
      case 'Enter': {
        const idx = this.indiceElegibleActivo();
        if (this.listaElegiblesAbierta() && idx >= 0 && idx < lista.length) {
          event.preventDefault();
          this.seleccionarElegible(lista[idx]);
        }
        break;
      }
      case 'Escape':
        if (this.listaElegiblesAbierta()) {
          event.preventDefault();
          event.stopPropagation();
          this.listaElegiblesAbierta.set(false);
          this.indiceElegibleActivo.set(-1);
        }
        break;
    }
  }

  alEscribirElegible(texto: string): void {
    this.terminoElegible.set(texto);
    this.listaElegiblesAbierta.set(true);
    this.indiceElegibleActivo.set(-1);

    if (this.timerElegible !== null) {
      clearTimeout(this.timerElegible);
    }

    this.timerElegible = setTimeout(() => {
      this.buscarEmpleadosElegibles();
    }, 250);
  }

  seleccionarElegible(empleado: EmpleadoElegibleItem): void {
    this.elegibleSeleccionado.set(empleado);
    this.terminoElegible.set('');
    this.listaElegiblesAbierta.set(false);
  }

  limpiarElegible(): void {
    this.elegibleSeleccionado.set(null);
    this.terminoElegible.set('');
    this.listaElegiblesAbierta.set(true);
    this.buscarEmpleadosElegibles();
  }

  buscarEmpleadosElegibles(): void {
    this.buscandoElegibles.set(true);
    this.service.buscarEmpleadosElegibles(this.terminoElegible()).subscribe({
      next: (res) => {
        this.elegibles.set(res.datos);
        this.buscandoElegibles.set(false);
      },
      error: () => {
        this.buscandoElegibles.set(false);
      },
    });
  }

  crearUsuario(): void {
    const empleado = this.elegibleSeleccionado();
    const rolId = this.rolNuevoUsuarioId();
    if (empleado === null || rolId === null || this.guardandoUsuario()) {
      return;
    }

    this.guardandoUsuario.set(true);
    this.error.set(null);
    this.exito.set(null);

    this.service.crearUsuario(empleado.id, rolId).subscribe({
      next: (res) => {
        this.guardandoUsuario.set(false);
        this.altaAbierta.set(false);
        this.exito.set(`Cuenta creada para ${res.datos.empleado.correo ?? res.datos.empleado.nombre}.`);
        this.cargarTodo();
      },
      error: (err) => {
        this.guardandoUsuario.set(false);
        this.error.set(err?.error?.message ?? 'No se pudo crear la cuenta.');
      },
    });
  }

  cambiarRol(usuario: UsuarioAdminItem, rolIdStr: string): void {
    const rolId = Number(rolIdStr);
    if (!rolId || rolId === usuario.rol?.id) {
      return;
    }

    this.error.set(null);
    this.exito.set(null);

    this.service.actualizarRolUsuario(usuario.id, rolId).subscribe({
      next: (res) => {
        this.usuarios.update((lista) =>
          lista.map((u) => (u.id === usuario.id ? res.datos : u)),
        );
        this.exito.set(`Rol actualizado para ${res.datos.empleado.nombre ?? 'el usuario'}.`);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'No se pudo actualizar el rol.');
      },
    });
  }

  alternarEstado(usuario: UsuarioAdminItem): void {
    this.error.set(null);
    this.exito.set(null);

    this.service.cambiarEstadoUsuario(usuario.id, !usuario.activo).subscribe({
      next: (res) => {
        this.usuarios.update((lista) =>
          lista.map((u) => (u.id === usuario.id ? res.datos : u)),
        );
        this.exito.set(
          res.datos.activo ? 'Cuenta reactivada correctamente.' : 'Cuenta suspendida correctamente.',
        );
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'No se pudo cambiar el estado de la cuenta.');
      },
    });
  }

  seleccionarRol(rol: RolAdminItem): void {
    this.rolSeleccionadoId.set(rol.id);
    const mapa: Record<number, string> = {};
    for (const p of rol.permisos) {
      mapa[p.permiso_id] = p.alcance;
    }
    this.seleccionPermisos.set(mapa);
  }

  togglePermiso(permiso: PermisoCatalogoItem, marcado: boolean): void {
    this.seleccionPermisos.update((actual) => {
      const copia = { ...actual };
      if (marcado) {
        copia[permiso.id] = permiso.alcances_soportados[0] ?? 'no_aplica';
      } else {
        delete copia[permiso.id];
      }
      return copia;
    });
  }

  cambiarAlcancePermiso(permisoId: number, alcance: string): void {
    this.seleccionPermisos.update((actual) => ({ ...actual, [permisoId]: alcance }));
  }

  guardarPermisosRol(): void {
    const rol = this.rolSeleccionado();
    if (rol === null || !rol.editable || this.guardandoPermisos()) {
      return;
    }

    const payload: PermisoRolPayload[] = Object.entries(this.seleccionPermisos()).map(
      ([id, alcance]) => ({
        permiso_id: Number(id),
        alcance,
      }),
    );

    this.guardandoPermisos.set(true);
    this.error.set(null);
    this.exito.set(null);

    this.service.sincronizarPermisosRol(rol.id, payload).subscribe({
      next: (res) => {
        this.guardandoPermisos.set(false);
        this.roles.update((lista) => lista.map((r) => (r.id === rol.id ? res.datos : r)));
        this.seleccionarRol(res.datos);
        this.exito.set(`Permisos guardados para ${res.datos.nombre}.`);
      },
      error: (err) => {
        this.guardandoPermisos.set(false);
        this.error.set(err?.error?.message ?? 'No se pudieron guardar los permisos del rol.');
      },
    });
  }

  crearRol(): void {
    const clave = this.claveGeneradaNuevoRol();
    const nombre = this.nuevoRolNombre().trim();
    if (!clave || !nombre || this.guardandoRol()) {
      return;
    }

    this.guardandoRol.set(true);
    this.error.set(null);
    this.exito.set(null);

    this.service
      .crearRol({
        clave,
        nombre,
        descripcion: this.nuevoRolDescripcion().trim() || nombre,
        nivel: Number(this.nuevoRolNivel()),
      })
      .subscribe({
        next: (res) => {
          this.guardandoRol.set(false);
          this.nuevoRolAbierto.set(false);
          this.nuevoRolNombre.set('');
          this.nuevoRolDescripcion.set('');
          this.roles.update((lista) => [...lista, res.datos]);
          this.seleccionarRol(res.datos);
          this.exito.set(`Rol "${res.datos.nombre}" creado. Ya puedes marcar sus permisos.`);
        },
        error: (err) => {
          this.guardandoRol.set(false);
          this.error.set(err?.error?.message ?? 'No se pudo crear el rol.');
        },
      });
  }
}
