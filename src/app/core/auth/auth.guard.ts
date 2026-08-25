import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import Keycloak from 'keycloak-js';

import { MailboxSessionService } from './mailbox-session.service';

// Two kinds of session reach this. A mailbox user has no Keycloak identity, so sending them
// to the Keycloak login would strand them: they are offered the stampyx form instead.
export const authGuard: CanActivateFn = (_route, state) => {
  const keycloak = inject(Keycloak);
  const mailbox = inject(MailboxSessionService);
  const router = inject(Router);

  if (mailbox.isActive() || keycloak.authenticated === true) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};
