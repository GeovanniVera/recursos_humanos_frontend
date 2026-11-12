import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

const STORAGE_KEY = 'utn-rh.theme';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('starts on light when nothing is stored', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('light');
  });

  it('restores the stored theme on a fresh instance, which is what a reload does', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');

    // A new instance reads storage in its field initializer, exactly like the
    // service created after F5.
    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
  });

  it('ignores a stored value that is not one of the themes', () => {
    localStorage.setItem(STORAGE_KEY, 'neon');
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('light');
  });

  it('writes the choice to storage and to the document root', async () => {
    const service = TestBed.inject(ThemeService);

    service.setTheme('guinda');
    TestBed.tick();

    expect(localStorage.getItem(STORAGE_KEY)).toBe('guinda');
    expect(document.documentElement.getAttribute('data-theme')).toBe('guinda');
  });
});
