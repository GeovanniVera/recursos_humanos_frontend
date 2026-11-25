/**
 * Client-side mirror of RN-07.
 *
 * The backend validates the same rules and answers `400` with the field name,
 * but it does not echo the term. Checking here first keeps an invalid term from
 * spending one of the 60 requests per minute and lets the field explain the
 * format while the user is still typing.
 *
 * Returns a message to show, or `null` when the term can travel.
 */
export function validarBusqueda(termino: string): string | null {
  const valor = termino.trim();

  // No term is a valid term: it means the whole roster.
  if (valor.length === 0) {
    return null;
  }

  // Only digits is an exact employee number, capped at 20.
  if (/^\d+$/.test(valor)) {
    return valor.length > 20 ? 'El número de empleado no puede superar los 20 dígitos.' : null;
  }

  // A mix of digits and letters is neither a number nor a name.
  if (/\d/.test(valor)) {
    return 'Un número de empleado es solo dígitos; un nombre no puede contener números.';
  }

  if (valor.length > 150) {
    return 'El nombre no puede superar los 150 caracteres.';
  }

  // Letters (including accents), spaces, apostrophe, hyphen and period. The
  // lookahead rejects a term made only of punctuation or spaces.
  if (!/^(?=.*\p{L})[\p{L}\p{M} .'’-]+$/u.test(valor)) {
    return 'El nombre solo admite letras, espacios, apóstrofo, guion o punto.';
  }

  return null;
}
