/**
 * Readable labels for the role codes the backend returns.
 *
 * Presentation only. The codes are the backend's vocabulary and the backend
 * stays the authority on what a person may do; this map decides one thing: how
 * a code is read by a human. That is why it lives next to the drawer instead of
 * in `AuthService` — `auth.models.ts` keeps the wire format untouched, and no
 * access decision is made here.
 *
 * An unknown code falls back to itself with its underscores opened up, so a
 * role added on the server reads as `Auditor Externo` instead of disappearing
 * behind a generic "Desconocido".
 */
const ROLE_LABELS: Readonly<Record<string, string>> = {
  ADMIN: 'Administrador',
  SECRETARIA: 'Secretaría',
  SECRETARIA_CIRCULARES: 'Secretaría de Circulares',
  SISTEMAS: 'Sistemas',
  SUPER_ADMIN: 'Super Administrador',
};

export function roleLabel(role: string | null | undefined): string {
  const code = (role ?? '').trim();
  if (code === '') {
    return 'Sin rol';
  }

  const known = ROLE_LABELS[code.toUpperCase()];
  if (known !== undefined) {
    return known;
  }

  return code
    .split('_')
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
