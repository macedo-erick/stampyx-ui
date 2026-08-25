import { HttpErrorResponse } from '@angular/common/http';

export interface ApiError {
  readonly timestamp: string;
  readonly status: number;
  readonly error: string;
  readonly message: string;
}

export interface NormalizedApiError {
  readonly status: number;
  readonly titleKey: string;
  readonly detail: string;
  readonly detailKey?: string;
  readonly fieldErrors: ReadonlyMap<string, string>;
}

function parseFieldErrors(message: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();

  const segments = message
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return result;
  }

  for (const segment of segments) {
    const separator = segment.indexOf(':');
    if (separator <= 0) {
      return new Map();
    }
    const field = segment.slice(0, separator).trim();
    const detail = segment.slice(separator + 1).trim();

    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(field) || !detail) {
      return new Map();
    }
    result.set(field, detail);
  }

  return result;
}

function titleKeyFor(status: number): string {
  switch (status) {
    case 0:
      return 'errors.offline';
    case 400:
      return 'errors.badRequest';
    case 401:
      return 'errors.unauthorized';
    case 403:
      return 'errors.forbidden';
    case 404:
      return 'errors.notFound';
    case 409:
      return 'errors.conflict';
    default:
      return 'errors.server';
  }
}

export function normalizeApiError(error: unknown): NormalizedApiError {
  if (!(error instanceof HttpErrorResponse)) {
    return {
      status: 0,
      titleKey: 'errors.server',
      detail: '',
      detailKey: 'errors.generic',
      fieldErrors: new Map(),
    };
  }

  if (error.status === 0) {
    return {
      status: 0,
      titleKey: 'errors.offline',
      detail: '',
      detailKey: 'errors.offlineDetail',
      fieldErrors: new Map(),
    };
  }

  const body = error.error as Partial<ApiError> | string | null;
  const message =
    typeof body === 'string'
      ? body
      : typeof body?.message === 'string'
        ? body.message
        : error.message;

  const fieldErrors = error.status === 400 ? parseFieldErrors(message) : new Map<string, string>();

  const detail = fieldErrors.size > 0 ? [...fieldErrors.values()].join(', ') : message;

  return {
    status: error.status,
    titleKey: titleKeyFor(error.status),
    detail,
    detailKey: detail ? undefined : 'errors.generic',
    fieldErrors,
  };
}
