import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import Keycloak from 'keycloak-js';
import { describe, expect, it, vi } from 'vitest';

import { authGuard } from './auth.guard';
import { MailboxSessionService } from './mailbox-session.service';

describe('authGuard', () => {
  function activate(options: { keycloak?: boolean; mailbox?: boolean; url?: string } = {}) {
    const login = vi.fn().mockResolvedValue(undefined);
    const createUrlTree = vi.fn().mockReturnValue({} as UrlTree);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Keycloak, useValue: { authenticated: options.keycloak ?? false, login } },
        { provide: MailboxSessionService, useValue: { isActive: () => options.mailbox ?? false } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      authGuard(
        {} as ActivatedRouteSnapshot,
        {
          url: options.url ?? '/lists',
        } as RouterStateSnapshot,
      ),
    );

    return { login, createUrlTree, result };
  }

  it('lets a signed-in visitor through without touching Keycloak', () => {
    const { result, login, createUrlTree } = activate({ keycloak: true });

    expect(result).toBe(true);
    expect(login).not.toHaveBeenCalled();
    expect(createUrlTree).not.toHaveBeenCalled();
  });

  it('lets a mailbox session through, which has no Keycloak identity at all', () => {
    const { result, login } = activate({ mailbox: true });

    expect(result).toBe(true);
    expect(login).not.toHaveBeenCalled();
  });

  it('turns a signed-out visitor away rather than rendering the page behind the guard', () => {
    expect(activate().result).not.toBe(true);
  });

  // Sending them straight to Keycloak would strand every mailbox user, since an administrator
  // provisioned them and they have no account to sign in with there.
  it('offers a signed-out visitor the stampyx form instead of the Keycloak login', () => {
    const { createUrlTree, login } = activate({ url: '/lists/3f1b8b8e' });

    expect(login).not.toHaveBeenCalled();
    expect(createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { redirect: '/lists/3f1b8b8e' },
    });
  });

  it('keeps the query string, so a deep link survives the round trip through login', () => {
    const { createUrlTree } = activate({ url: '/lists?status=closed' });

    expect(createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { redirect: '/lists?status=closed' },
    });
  });
});
