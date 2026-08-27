import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { MailboxSessionService } from './mailbox-session.service';

// Anchored to the API origin: the token must never travel to a third-party host.
export const stampyxTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(MailboxSessionService).token();

  if (token === null || !request.url.startsWith(environment.apiUrl)) {
    return next(request);
  }

  return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
