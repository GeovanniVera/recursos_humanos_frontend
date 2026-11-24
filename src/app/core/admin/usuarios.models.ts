export interface UsuarioRolResumen {
  id: number;
  clave: string;
  nombre: string;
  nivel: number;
  es_sistema: boolean;
}

export interface UsuarioEmpleadoResumen {
  id: number;
  num_empleado: string | null;
  nombre: string | null;
  correo: string | null;
  area: string | null;
  estatus: string | null;
}

export interface UsuarioAdminItem {
  id: number;
  activo: boolean;
  fecha_registro: string | null;
  editable: boolean;
  empleado: UsuarioEmpleadoResumen;
  rol: UsuarioRolResumen | null;
}

export interface UsuariosListadoResponse {
  datos: UsuarioAdminItem[];
  meta: {
    pagina_actual: number;
    ultima_pagina: number;
    por_pagina: number;
    total: number;
  };
}

export interface EmpleadoElegibleItem {
  id: number;
  num_empleado: string;
  nombre: string;
  correo_institucional: string;
  area: string | null;
}

export interface PermisoCatalogoItem {
  id: number;
  clave: string;
  recurso: string;
  accion: string;
  descripcion: string;
  alcances_soportados: string[];
  asignable: boolean;
}

export interface RolPermisoAsignado {
  permiso_id: number;
  clave: string;
  alcance: string;
  campos_permitidos: string[] | null;
}

export interface RolAdminItem {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string;
  nivel: number;
  es_sistema: boolean;
  activo: boolean;
  usuarios_count: number;
  editable: boolean;
  permisos: RolPermisoAsignado[];
}

export interface CrearRolRequest {
  clave: string;
  nombre: string;
  descripcion: string;
  nivel: number;
}

export interface PermisoRolPayload {
  permiso_id: number;
  alcance: string;
  campos_permitidos?: string[] | null;
}
