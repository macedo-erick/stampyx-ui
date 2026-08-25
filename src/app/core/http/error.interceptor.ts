import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { TranslocoService } from '@jsverse/transloco';
import { catchError, throwError } from 'rxjs';

import { normalizeApiError } from './api-error';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const messages = inject(MessageService);
  const transloco = inject(TranslocoService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        const normalized = normalizeApiError(error);
        messages.add({
          severity: 'error',
          summary: transloco.translate(normalized.titleKey),
          detail: normalized.detailKey
            ? transloco.translate(normalized.detailKey)
            : normalized.detail,
          life: 6000,
        });
      }
      return throwError(() => error);
    }),
  );
};
