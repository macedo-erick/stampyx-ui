import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { provideTestingTransloco } from '../../../testing/transloco';
import { errorInterceptor } from './error.interceptor';

const URL = 'http://localhost:8088/api/lists';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let add: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    add = vi.fn();

    TestBed.configureTestingModule({
      imports: [provideTestingTransloco()],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add } },
      ],
    });

    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  function fail(status: number, body: { message: string } | null = null) {
    const caught = vi.fn();

    http.get(URL).subscribe({ error: caught });
    backend.expectOne(URL).flush(body, { status, statusText: 'Error' });

    return caught;
  }

  it('says nothing when the request succeeds', () => {
    http.get(URL).subscribe();
    backend.expectOne(URL).flush({});

    expect(add).not.toHaveBeenCalled();
  });

  it('shows the failure as a translated toast rather than a raw key', () => {
    fail(404);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0]).toMatchObject({
      severity: 'error',
      summary: 'Not found',
    });
  });

  it('stays silent on a 401, because the login redirect is the response to that', () => {
    fail(401);

    expect(add).not.toHaveBeenCalled();
  });

  it('shows the detail the server sent, since it says more than the status does', () => {
    fail(409, { message: 'That list is already closed' });

    expect(add.mock.calls[0][0].detail).toBe('That list is already closed');
  });

  it('falls back to a translated generic detail when the server sent none', () => {
    fail(0);

    expect(add.mock.calls[0][0]).toMatchObject({
      summary: 'Cannot reach the server',
      detail: 'Check that the API is running and that CORS allows this origin.',
    });
  });

  it('rethrows so the caller still sees the failure it was waiting on', () => {
    const caught = fail(500);

    expect(caught).toHaveBeenCalledTimes(1);
    expect(caught.mock.calls[0][0]).toBeInstanceOf(HttpErrorResponse);
  });

  it('reports a validation failure with the field details joined into one line', () => {
    fail(400, { message: 'name: must not be blank; quantity: must be positive' });

    expect(add.mock.calls[0][0]).toMatchObject({
      summary: 'Invalid data',
      detail: 'must not be blank, must be positive',
    });
  });
});
