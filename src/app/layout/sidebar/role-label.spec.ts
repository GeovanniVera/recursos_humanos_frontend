import { roleLabel } from './role-label';

describe('roleLabel', () => {
  it('reads every known role code as a name', () => {
    expect(roleLabel('SUPER_ADMIN')).toBe('Super Administrador');
    expect(roleLabel('ADMIN')).toBe('Administrador');
    expect(roleLabel('SISTEMAS')).toBe('Sistemas');
    expect(roleLabel('SECRETARIA')).toBe('Secretaría');
    expect(roleLabel('SECRETARIA_CIRCULARES')).toBe('Secretaría de Circulares');
  });

  it('is not case sensitive, because the code is a wire value', () => {
    expect(roleLabel('admin')).toBe('Administrador');
    expect(roleLabel('  SUPER_ADMIN  ')).toBe('Super Administrador');
  });

  it('falls back to the code itself, opened up and titled', () => {
    expect(roleLabel('AUDITOR_EXTERNO')).toBe('Auditor Externo');
    expect(roleLabel('auditor_externo')).toBe('Auditor Externo');
    expect(roleLabel('BECARIO')).toBe('Becario');
  });

  it('answers an empty session with a readable placeholder', () => {
    expect(roleLabel(null)).toBe('Sin rol');
    expect(roleLabel(undefined)).toBe('Sin rol');
    expect(roleLabel('   ')).toBe('Sin rol');
  });
});
