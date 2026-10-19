import { NextRequest } from 'next/server';
import middleware from '@/middleware';

describe('middleware', () => {
  it('adds security headers to responses', () => {
    const request = new NextRequest('http://localhost:3000/');
    const response = middleware(request);

    expect(response).toBeDefined();
    expect(response?.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response?.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response?.headers.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin'
    );
  });

  it('allows same-origin camera access for the QR scanner', () => {
    const request = new NextRequest('http://localhost:3000/');
    const response = middleware(request);

    const permissionsPolicy = response?.headers.get('Permissions-Policy');
    expect(permissionsPolicy).toBeDefined();
    // The QR scanner (components/send/qr-scanner.tsx and
    // components/request/request-page-client.tsx) calls getUserMedia, so the
    // policy must permit camera access on same-origin pages.
    expect(permissionsPolicy).toContain('camera=(self)');
    expect(permissionsPolicy).not.toContain('camera=()');
  });
});
