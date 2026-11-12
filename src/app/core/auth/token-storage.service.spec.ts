import { TestBed } from '@angular/core/testing';
import { TokenStorageService } from './token-storage.service';

describe('TokenStorageService', () => {
  let service: TokenStorageService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TokenStorageService);
  });

  it('writes a token and reads it back', () => {
    service.write('test-token');

    expect(service.read()).toBe('test-token');
    expect(sessionStorage.getItem('utn-rh.token')).toBe('test-token');
  });

  it('returns null when no token was stored', () => {
    expect(service.read()).toBeNull();
  });

  it('clear() removes the stored token', () => {
    service.write('test-token');

    service.clear();

    expect(service.read()).toBeNull();
    expect(sessionStorage.getItem('utn-rh.token')).toBeNull();
  });
});
