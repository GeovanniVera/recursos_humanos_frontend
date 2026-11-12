/**
 * Payloads of the authentication API.
 *
 * Field names stay in snake_case on purpose: they are the wire format of the
 * backend, so every interface maps 1:1 to the JSON body and nothing needs to
 * be transformed on the way in or out.
 */

/** Body of `POST /auth/otp`. */
export interface SolicitarCodigoRequest {
  correo: string;
}

/** `200` answer of `POST /auth/otp` (deliberately generic). */
export interface SolicitarCodigoResponse {
  message: string;
}

/** Body of `POST /auth/otp/verificar`. */
export interface VerificarCodigoRequest {
  correo: string;
  codigo: string;
}

/** `200` answer of `POST /auth/otp/verificar`. */
export interface VerificarCodigoResponse {
  token: string;
  tipo: 'Bearer';
  rol: string;
  modulo: string;
  redirect: string;
  /** ISO 8601 timestamp of the token expiration. */
  expira_en: string;
}

/** `200` answer of `GET /auth/sesion`. */
export interface SesionResponse {
  usuario_id: number;
  empleado_id: number;
  nombre: string | null;
  rol: string | null;
}

/** Error envelope shared by every endpoint that can fail. */
export interface ApiErrorResponse {
  message: string;
  /** Present on `422` from `/auth/otp/verificar`. */
  intentos_restantes?: number;
  /** Present on `429` responses. */
  reintentar_en_segundos?: number;
}
