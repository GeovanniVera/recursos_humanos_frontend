import {
  EXPLICACION_CURP,
  MENSAJE_CURP_INVALIDA,
  calcularDigitoVerificador,
  curpFechaNacimiento,
  curpSexo,
  normalizarCorreo,
  normalizarCurp,
  trabajaOtroDondeRequerido,
  validarAniosExperiencia,
  validarCorreo,
  validarCurp,
  validarFecha,
  validarGeneracion,
  validarInicioPuesto,
  validarLargo,
  validarNombre,
  validarNumEmpleado,
} from './validacion';

/**
 * CURP published by the RENAPO as the example of a well formed one: issued in
 * Veracruz in 1956, female, homoclave `0` (a digit, so 1900s).
 */
const CURP_VALIDA = 'HEGG560427MVZRRL04';

describe('validarCurp', () => {
  it('accepts the example published by the RENAPO', () => {
    const resultado = validarCurp(CURP_VALIDA);

    expect(resultado.valida).toBe(true);
    expect(resultado.motivos).toEqual([]);
  });

  it('does not treat an absent CURP as a mistake: the field is optional', () => {
    expect(validarCurp('').valida).toBe(true);
    expect(validarCurp('   ').valida).toBe(true);
  });

  it('normalises lower case and surrounding blanks before checking', () => {
    expect(normalizarCurp(' hegg560427mvzrrl04 ')).toBe(CURP_VALIDA);
    expect(validarCurp(' hegg560427mvzrrl04 ').valida).toBe(true);
  });

  it('reports the length of a CURP that is not 18 characters', () => {
    const resultado = validarCurp('HEGG560427MVZRRL0');

    expect(resultado.valida).toBe(false);
    expect(resultado.motivos).toEqual(['longitud']);
  });

  it('reports a shape that is not the official pattern', () => {
    // The eleventh position is the sex: a digit there can only be a typo.
    const resultado = validarCurp('HEGG5604271VZRRL04');

    expect(resultado.motivos).toEqual(['formato']);
  });

  it('reports an entity that does not exist', () => {
    const resultado = validarCurp('HEGG560427XXZRRL04');

    expect(resultado.motivos).toEqual(['entidad']);
  });

  it('reports a date that is not a real day', () => {
    // 99-13-32: no thirteenth month, no thirty-second day.
    const resultado = validarCurp('HEGG991332MVZRRL04');

    expect(resultado.motivos).toEqual(['fecha']);
  });

  it('reports a birth date in the future, read with the century of the homoclave', () => {
    // A letter in the homoclave means 2000s, so 900101 is 2090-01-01.
    const resultado = validarCurp('HEGG900101MVZRRLA4');

    expect(resultado.motivos).toEqual(['fecha']);
  });

  it('reports a check digit that does not match the rest of the CURP', () => {
    const resultado = validarCurp(`${CURP_VALIDA.slice(0, 17)}5`);

    expect(resultado.motivos).toEqual(['digito']);
  });

  it('explains every motivo without ever replacing the single sentence', () => {
    expect(Object.keys(EXPLICACION_CURP).sort()).toEqual([
      'digito',
      'entidad',
      'fecha',
      'formato',
      'longitud',
    ]);
    // One sentence for all five cases: the backend collapses them the same way.
    expect(MENSAJE_CURP_INVALIDA).toBe(
      'La CURP no es válida. Revisa el formato, la entidad y el dígito verificador.',
    );
  });
});

describe('calcularDigitoVerificador', () => {
  it('is stable for a known 17-character base', () => {
    const base = CURP_VALIDA.slice(0, 17);

    // Twice, so the value is reproducible and not a side effect of the state.
    expect(calcularDigitoVerificador(base)).toBe(4);
    expect(calcularDigitoVerificador(base)).toBe(4);
    // The digit it computes is exactly the one the valid CURP carries.
    expect(`${base}${calcularDigitoVerificador(base)}`).toBe(CURP_VALIDA);
  });

  it('answers null when there is nothing to weigh', () => {
    expect(calcularDigitoVerificador('HEGG560427MVZRRL')).toBeNull();
    // `#` is outside the table of the algorithm.
    expect(calcularDigitoVerificador('HEGG560427MVZRRL#')).toBeNull();
  });
});

describe('curpFechaNacimiento', () => {
  it('reads the 1900s when the homoclave is a digit', () => {
    expect(curpFechaNacimiento(CURP_VALIDA)).toBe('1956-04-27');
  });

  it('reads the 2000s when the homoclave is a letter', () => {
    expect(curpFechaNacimiento('HEGG560427MVZRRLA4')).toBe('2056-04-27');
  });

  it('answers null for a CURP that is not complete', () => {
    expect(curpFechaNacimiento('HEGG560427')).toBeNull();
    expect(curpFechaNacimiento('')).toBeNull();
  });
});

describe('curpSexo', () => {
  it('maps H and M to the labels of the catalog', () => {
    expect(curpSexo(CURP_VALIDA)).toBe('Femenino');
    expect(curpSexo('HEGG560427HVZRRL04')).toBe('Masculino');
  });

  it('answers null for X, which is not a value to invent', () => {
    expect(curpSexo('HEGG560427XVZRRL04')).toBeNull();
  });
});

describe('validarGeneracion', () => {
  it('rejects a final year before the initial one', () => {
    expect(validarGeneracion('2023-2019')).toBe(
      'El año final de la generación no puede ser anterior al inicial.',
    );
  });

  it('accepts a generation in order and an absent one', () => {
    expect(validarGeneracion('2019-2023')).toBeNull();
    expect(validarGeneracion('')).toBeNull();
  });

  it('rejects a shape that is not AAAA-AAAA', () => {
    expect(validarGeneracion('19-23')).toBe('La generación debe tener el formato AAAA-AAAA.');
  });
});

describe('validarInicioPuesto', () => {
  it('rejects a start before the entry to the government', () => {
    expect(validarInicioPuesto('2020-01-01', '2021-06-30')).toBe(
      'La fecha de inicio en el puesto no puede ser anterior al ingreso al gobierno.',
    );
  });

  it('accepts a start on the same day, and compares nothing when one is absent', () => {
    expect(validarInicioPuesto('2021-06-30', '2021-06-30')).toBeNull();
    expect(validarInicioPuesto('2024-01-01', '')).toBeNull();
  });
});

describe('validarAniosExperiencia', () => {
  it('rejects a value outside 0 to 100', () => {
    expect(validarAniosExperiencia(-1)).not.toBeNull();
    expect(validarAniosExperiencia(101)).not.toBeNull();
    expect(validarAniosExperiencia(2.5)).not.toBeNull();
  });

  it('accepts the bounds, an absent value and zero as a real answer', () => {
    expect(validarAniosExperiencia(0)).toBeNull();
    expect(validarAniosExperiencia(100)).toBeNull();
    expect(validarAniosExperiencia(null)).toBeNull();
  });
});

describe('trabajaOtroDondeRequerido', () => {
  it('requires the detail for a public or private job', () => {
    expect(trabajaOtroDondeRequerido('Publico')).toBe('requerido');
    expect(trabajaOtroDondeRequerido('Privado')).toBe('requerido');
  });

  it('forbids the detail when the answer is No', () => {
    expect(trabajaOtroDondeRequerido('No')).toBe('prohibido');
  });

  it('leaves it optional for any other answer', () => {
    expect(trabajaOtroDondeRequerido('')).toBe('opcional');
  });
});

describe('validarFecha', () => {
  it('rejects a day that does not exist', () => {
    expect(validarFecha('2023-02-29')).toBe('La fecha no es válida.');
    expect(validarFecha('2023-13-01')).toBe('La fecha no es válida.');
    expect(validarFecha('15/01/2023')).toBe('La fecha no es válida.');
  });

  it('accepts the 29th of February of a leap year', () => {
    expect(validarFecha('2024-02-29')).toBeNull();
  });

  it('rejects a future day only when asked to', () => {
    expect(validarFecha('2999-01-01', { noFutura: true })).toBe('La fecha no puede ser futura.');
    expect(validarFecha('2999-01-01')).toBeNull();
  });

  it('accepts an empty value: requiring one belongs to the step', () => {
    expect(validarFecha('', { noFutura: true })).toBeNull();
  });
});

describe('the bounded text fields', () => {
  it('requires the number and the name', () => {
    expect(validarNumEmpleado('   ')).toBe('El número de empleado es obligatorio.');
    expect(validarNombre('')).toBe('El nombre es obligatorio.');
  });

  it('caps the number, the name and the email at the length of the server', () => {
    expect(validarNumEmpleado('1'.repeat(20))).toBeNull();
    expect(validarNumEmpleado('1'.repeat(21))).not.toBeNull();
    expect(validarNombre('a'.repeat(150))).toBeNull();
    expect(validarNombre('a'.repeat(151))).not.toBeNull();
    expect(validarCorreo(`${'a'.repeat(140)}@utn.edu.mx`)).not.toBeNull();
  });

  it('validates the shape of the email', () => {
    expect(validarCorreo('ana@utn.edu.mx')).toBeNull();
    expect(validarCorreo('ana@utn')).toBe('Escribe un correo con formato válido.');
    expect(validarCorreo('ana utn.edu.mx')).toBe('Escribe un correo con formato válido.');
    expect(validarCorreo('')).toBe('El correo institucional es obligatorio.');
  });

  it('accepts only the institutional domain, case-insensitively', () => {
    // The backend lower-cases the address before comparing against its list.
    expect(validarCorreo('ana@UTN.edu.mx')).toBeNull();
    expect(validarCorreo('  ana@utn.edu.mx  ')).toBeNull();

    expect(validarCorreo('ana@gmail.com')).toBe(
      'El correo debe pertenecer al dominio institucional.',
    );
    expect(validarCorreo('ana@utn.edu.mx.com')).toBe(
      'El correo debe pertenecer al dominio institucional.',
    );
    expect(validarCorreo('ana@sub.utn.edu.mx')).toBe(
      'El correo debe pertenecer al dominio institucional.',
    );
  });

  it('normalises the email the way the backend does', () => {
    expect(normalizarCorreo('  Persona@UTN.EDU.MX ')).toBe('persona@utn.edu.mx');
  });

  it('measures an optional text trimmed, against the limit of the server', () => {
    expect(validarLargo('a'.repeat(100), 100)).toBeNull();
    expect(validarLargo('a'.repeat(101), 100)).toBe(
      'El texto no puede superar los 100 caracteres.',
    );
    expect(validarLargo('   ', 100)).toBeNull();
  });
});
