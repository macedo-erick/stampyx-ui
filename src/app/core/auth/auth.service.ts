import { Location } from '@angular/common';
import { Service, computed, inject, signal } from '@angular/core';
import Keycloak from 'keycloak-js';

import { MailboxSessionService } from './mailbox-session.service';

interface StampyxTokenClaims {
  readonly sub?: string;
  readonly name?: string;
  readonly preferred_username?: string;
  readonly given_name?: string;
  readonly email?: string;
}

export type SessionKind = 'account' | 'mailbox';

// A facade over the two ways into the panel. People who registered themselves come through
// Keycloak; mailbox users an administrator provisioned come through a stampyx token. Screens
// read the same signals either way.
@Service()
export class AuthService {
  private readonly keycloak = inject(Keycloak);
  private readonly mailbox = inject(MailboxSessionService);
  private readonly location = inject(Location);

  private readonly claims = signal<StampyxTokenClaims>(
    (this.keycloak.tokenParsed ?? {}) as StampyxTokenClaims,
  );

  readonly kind = computed<SessionKind | null>(() => {
    if (this.mailbox.isActive()) {
      return 'mailbox';
    }

    return this.keycloak.authenticated === true ? 'account' : null;
  });

  readonly isAuthenticated = computed(() => this.kind() !== null);

  readonly userId = computed(() => this.claims().sub ?? null);

  readonly username = computed(() => this.claims().preferred_username ?? '');

  readonly email = computed(() => this.mailbox.address() ?? this.claims().email ?? '');

  readonly displayName = computed(() => {
    const address = this.mailbox.address();

    if (address !== null) {
      return address;
    }

    const c = this.claims();
    return c.name || c.given_name || c.preferred_username || 'User';
  });

  readonly initials = computed(() =>
    this.displayName()
      .split(/[\s.@]+/)
      .filter((part) => part !== '')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join(''),
  );

  // Only a Keycloak session has a self-service console; a mailbox user changes their password
  // in stampyx, because that is the password Dovecot checks.
  readonly canManageAccount = computed(() => this.kind() === 'account');

  token(): string | null {
    return this.mailbox.token() ?? this.keycloak.token ?? null;
  }

  async refreshClaims(): Promise<void> {
    if (this.kind() !== 'account') {
      return;
    }

    await this.keycloak.updateToken(-1);
    this.claims.set((this.keycloak.tokenParsed ?? {}) as StampyxTokenClaims);
  }

  login(redirectPath = '/'): void {
    void this.keycloak.login({ redirectUri: this.absoluteUrl(redirectPath) });
  }

  logout(): void {
    if (this.kind() === 'mailbox') {
      this.mailbox.logout();
      window.location.assign(this.absoluteUrl('/login'));

      return;
    }

    void this.keycloak.logout({ redirectUri: this.absoluteUrl('/') });
  }

  openAccountManagement(): void {
    void this.keycloak.accountManagement();
  }

  private absoluteUrl(path: string): string {
    return `${window.location.origin}${this.location.prepareExternalUrl(path)}`;
  }
}
