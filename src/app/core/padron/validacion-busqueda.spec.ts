import { validarBusqueda } from './validacion-busqueda';

describe('validarBusqueda', () => {
  it('accepts no term: the whole roster is a valid query', () => {
    expect(validarBusqueda('')).toBeNull();
    expect(validarBusqueda('   ')).toBeNull();
  });

  it('accepts a numeric employee number of up to 20 digits', () => {
    expect(validarBusqueda('12345')).toBeNull();
    expect(validarBusqueda('1'.repeat(20))).toBeNull();
  });

  it('rejects a numeric employee number longer than 20 digits', () => {
    expect(validarBusqueda('1'.repeat(21))).toBe(
      'El número de empleado no puede superar los 20 dígitos.',
    );
  });

  it('rejects a term that mixes digits with letters', () => {
    expect(validarBusqueda('ana123')).toBe(
      'Un número de empleado es solo dígitos; un nombre no puede contener números.',
    );
  });

  it('accepts a name with accents, blanks, apostrophe, hyphen and period', () => {
    expect(validarBusqueda('Ana María')).toBeNull();
    expect(validarBusqueda("O'Connor")).toBeNull();
    expect(validarBusqueda('José Luis Pérez-Sánchez')).toBeNull();
    expect(validarBusqueda('M. en C. Ana')).toBeNull();
  });

  it('rejects a name longer than 150 characters', () => {
    expect(validarBusqueda('a'.repeat(151))).toBe(
      'El nombre no puede superar los 150 caracteres.',
    );
  });

  it('rejects punctuation without a single letter', () => {
    expect(validarBusqueda('...')).toBe(
      'El nombre solo admite letras, espacios, apóstrofo, guion o punto.',
    );
    expect(validarBusqueda('@ana')).toBe(
      'El nombre solo admite letras, espacios, apóstrofo, guion o punto.',
    );
  });
});
