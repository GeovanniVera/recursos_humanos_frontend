import { TestBed } from '@angular/core/testing';
import { TokenPreview } from './token-preview.component';

describe('TokenPreview', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TokenPreview],
    }).compileComponents();
  });

  it('should render the design base heading', async () => {
    const fixture = TestBed.createComponent(TokenPreview);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Base de diseño');
  });

  it('should apply the default light theme on the document root', async () => {
    const fixture = TestBed.createComponent(TokenPreview);
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
