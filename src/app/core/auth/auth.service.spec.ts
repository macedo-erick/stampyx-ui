import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import Keycloak from 'keycloak-js';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';

interface FakeKeycloak {
  authenticated?: boolean;
  tokenParsed?: Record<string, unknown>;
  updateToken: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  accountManagement: ReturnType<typeof vi.fn>;
}

function fakeKeycloak(overrides: Partial<FakeKeycloak> = {}): FakeKeycloak {
  return {
    authenticated: true,
    tokenParsed: {
      sub: 'a3f1b8b8-2b7a-4c65-9c2e-1f0f6a5d9b11',
      preferred_username: 'erick',
      email: 'erick@stampyx.test',
      name: 'Erick Macedo',
    },
    updateToken: vi.fn().mockResolvedValue(true),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    accountManagement: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function build(keycloak: FakeKeycloak): AuthService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [AuthService, { provide: Keycloak, useValue: keycloak }],
  });

  return TestBed.inject(AuthService);
}

describe('AuthService', () => {
  it('reads the signed-in user out of the token rather than from an extra request', () => {
    const service = build(fakeKeycloak());

    expect(service.isAuthenticated()).toBe(true);
    expect(service.userId()).toBe('a3f1b8b8-2b7a-4c65-9c2e-1f0f6a5d9b11');
    expect(service.username()).toBe('erick');
    expect(service.email()).toBe('erick@stampyx.test');
  });

  it('reports an anonymous visitor rather than throwing when there is no token', () => {
    const service = build(fakeKeycloak({ authenticated: false, tokenParsed: undefined }));

    expect(service.isAuthenticated()).toBe(false);
    expect(service.userId()).toBeNull();
    expect(service.username()).toBe('');
    expect(service.email()).toBe('');
  });

  it('prefers the full name, then the given name, then the username for display', () => {
    expect(build(fakeKeycloak()).displayName()).toBe('Erick Macedo');

    expect(
      build(
        fakeKeycloak({ tokenParsed: { given_name: 'Erick', preferred_username: 'erick' } }),
      ).displayName(),
    ).toBe('Erick');

    expect(
      build(fakeKeycloak({ tokenParsed: { preferred_username: 'erick' } })).displayName(),
    ).toBe('erick');
  });

  it('falls back to a generic name so the avatar is never blank', () => {
    expect(build(fakeKeycloak({ tokenParsed: {} })).displayName()).toBe('User');
    expect(build(fakeKeycloak({ tokenParsed: {} })).initials()).toBe('U');
  });

  it('builds initials from the first two words, because an avatar fits no more', () => {
    expect(build(fakeKeycloak()).initials()).toBe('EM');

    expect(build(fakeKeycloak({ tokenParsed: { name: 'Ana Paula de Souza' } })).initials()).toBe(
      'AP',
    );
  });

  it('uppercases initials taken from a lowercase username', () => {
    expect(build(fakeKeycloak({ tokenParsed: { preferred_username: 'erick' } })).initials()).toBe(
      'E',
    );
  });

  it('rereads the claims after a refresh, so a renamed user stops showing the old name', async () => {
    const keycloak = fakeKeycloak();
    const service = build(keycloak);

    expect(service.displayName()).toBe('Erick Macedo');

    keycloak.tokenParsed = { name: 'Erick M. Silva' };
    await service.refreshClaims();

    expect(keycloak.updateToken).toHaveBeenCalledWith(-1);
    expect(service.displayName()).toBe('Erick M. Silva');
  });

  it('sends the user back to where they were after signing in', () => {
    const keycloak = fakeKeycloak();
    const service = build(keycloak);
    const prepare = vi.spyOn(TestBed.inject(Location), 'prepareExternalUrl');

    prepare.mockReturnValue('/app/lists');
    service.login('/lists');

    expect(keycloak.login).toHaveBeenCalledWith({
      redirectUri: `${window.location.origin}/app/lists`,
    });
  });

  it('sends the user to the root after signing out, not back to a page they cannot see', () => {
    const keycloak = fakeKeycloak();
    const service = build(keycloak);

    service.logout();

    expect(keycloak.logout).toHaveBeenCalledWith({
      redirectUri: `${window.location.origin}/`,
    });
  });

  it('hands account management to Keycloak, which owns the profile', () => {
    const keycloak = fakeKeycloak();

    build(keycloak).openAccountManagement();

    expect(keycloak.accountManagement).toHaveBeenCalled();
  });
});
