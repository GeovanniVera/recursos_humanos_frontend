import { TestBed } from '@angular/core/testing';
import { SidebarStateService } from './sidebar-state.service';

const STORAGE_KEY = 'utn-rh.sidebar-collapsed';

describe('SidebarStateService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('starts expanded', () => {
    expect(TestBed.inject(SidebarStateService).collapsed()).toBe(false);
  });

  it('toggle() flips the state both ways', () => {
    const service = TestBed.inject(SidebarStateService);

    service.toggle();
    expect(service.collapsed()).toBe(true);

    service.toggle();
    expect(service.collapsed()).toBe(false);
  });

  it('writes the state to localStorage', () => {
    const service = TestBed.inject(SidebarStateService);

    service.setCollapsed(true);
    TestBed.tick();

    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('reads a stored true back on a fresh instance', () => {
    localStorage.setItem(STORAGE_KEY, 'true');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(SidebarStateService).collapsed()).toBe(true);
  });
});
