import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import Keycloak from 'keycloak-js';

import { MailboxSessionService } from './mailbox-session.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const keycloak = inject(Keycloak);
  const mailbox = inject(MailboxSessionService);
  const router = inject(Router);

  if (mailbox.isActive() || keycloak.authenticated === true) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};
