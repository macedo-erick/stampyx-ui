import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { normalizeApiError } from './api-error';

function httpError(status: number, error: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: 'Error',
    error,
    url: 'https://api.stampyx.test/lists',
  });
}

describe('normalizeApiError', () => {
  it('treats a thrown non-HTTP value as a server fault rather than leaking it to the screen', () => {
    const normalized = normalizeApiError(new TypeError('reading of undefined'));

    expect(normalized.status).toBe(0);
    expect(normalized.titleKey).toBe('errors.server');
    expect(normalized.detailKey).toBe('errors.generic');
    expect(normalized.detail).toBe('');
  });

  it('reports a status 0 as being offline, not as a server that answered badly', () => {
    const normalized = normalizeApiError(httpError(0));

    expect(normalized.titleKey).toBe('errors.offline');
    expect(normalized.detailKey).toBe('errors.offlineDetail');
    expect(normalized.fieldErrors.size).toBe(0);
  });

  it('maps each status the API actually returns to its own title', () => {
    const titles = [400, 401, 403, 404, 409].map(
      (status) => normalizeApiError(httpError(status)).titleKey,
    );

    expect(titles).toEqual([
      'errors.badRequest',
      'errors.unauthorized',
      'errors.forbidden',
      'errors.notFound',
      'errors.conflict',
    ]);
  });

  it('falls back to the server title for a status with no specific message', () => {
    expect(normalizeApiError(httpError(500)).titleKey).toBe('errors.server');
    expect(normalizeApiError(httpError(503)).titleKey).toBe('errors.server');
  });

  it('reads the detail out of the API error body instead of the generated HTTP message', () => {
    const normalized = normalizeApiError(
      httpError(409, {
        timestamp: '2026-08-01T10:00:00Z',
        status: 409,
        error: 'Conflict',
        message: 'That list is already closed',
      }),
    );

    expect(normalized.detail).toBe('That list is already closed');
    expect(normalized.detailKey).toBeUndefined();
  });

  it('accepts a plain string body, which is what the gateway returns', () => {
    expect(normalizeApiError(httpError(503, 'upstream unavailable')).detail).toBe(
      'upstream unavailable',
    );
  });

  it('splits a validation message into per-field errors so a form can show them inline', () => {
    const normalized = normalizeApiError(
      httpError(400, { message: 'name: must not be blank; quantity: must be positive' }),
    );

    expect([...normalized.fieldErrors]).toEqual([
      ['name', 'must not be blank'],
      ['quantity', 'must be positive'],
    ]);
    expect(normalized.detail).toBe('must not be blank, must be positive');
  });

  it('only looks for field errors on a 400, since other statuses are not validation', () => {
    const normalized = normalizeApiError(httpError(409, { message: 'name: already taken' }));

    expect(normalized.fieldErrors.size).toBe(0);
    expect(normalized.detail).toBe('name: already taken');
  });

  it('keeps a prose message whole rather than splitting it at an incidental colon', () => {
    const normalized = normalizeApiError(
      httpError(400, { message: 'Request failed: the payload was rejected' }),
    );

    expect(normalized.fieldErrors.size).toBe(0);
    expect(normalized.detail).toBe('Request failed: the payload was rejected');
  });

  it('rejects the whole parse when any segment is not a field, so nothing is half-attributed', () => {
    const normalized = normalizeApiError(
      httpError(400, { message: 'name: must not be blank; something went wrong' }),
    );

    expect(normalized.fieldErrors.size).toBe(0);
    expect(normalized.detail).toBe('name: must not be blank; something went wrong');
  });

  it('rejects a field with no detail and a detail with no field', () => {
    expect(normalizeApiError(httpError(400, { message: 'name:' })).fieldErrors.size).toBe(0);
    expect(
      normalizeApiError(httpError(400, { message: ': must not be blank' })).fieldErrors.size,
    ).toBe(0);
  });

  it('asks for a generic detail when the server gave nothing to show', () => {
    const normalized = normalizeApiError(httpError(400, { message: '' }));

    expect(normalized.detail).toBe('');
    expect(normalized.detailKey).toBe('errors.generic');
  });
});
