import { HttpClient, httpResource } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { type Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Mailbox, Me, PlatformDomain } from '../../shared/models';
import { AuthService } from '../auth/auth.service';

@Service()
export class MeService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiUrl}/me`;

  readonly resource = httpResource<Me>(() => (this.auth.isAuthenticated() ? this.base : undefined));

  readonly me = computed(() => this.resource.value());
  readonly isLoading = computed(() => this.resource.isLoading());
  readonly kind = computed(() => this.me()?.kind ?? null);
  readonly isAdmin = computed(() => this.me()?.admin ?? false);
  readonly needsAddress = computed(() => this.me()?.needsAddress ?? false);
  readonly suggestedLocalPart = computed(() => this.me()?.suggestedLocalPart ?? null);
  readonly suggestedDomainId = computed(() => this.me()?.suggestedDomainId ?? null);

  private readonly dismissed = signal(false);

  readonly shouldPromptAddress = computed(() => this.needsAddress() && !this.dismissed());

  dismissAddressPrompt(): void {
    this.dismissed.set(true);
  }
  readonly mailboxes = computed(() => this.me()?.mailboxes ?? []);
  readonly platformAddress = computed(() => this.me()?.platformAddress ?? null);

  platformDomains(): Observable<PlatformDomain[]> {
    return this.http.get<PlatformDomain[]>(`${environment.apiUrl}/platform-domains`);
  }

  availability(domainId: string, localPart: string): Observable<{ available: boolean }> {
    return this.http.get<{ available: boolean }>(`${this.base}/address/availability`, {
      params: { domainId, localPart },
    });
  }

  claimAddress(domainId: string, localPart: string): Observable<Mailbox> {
    return this.http
      .post<Mailbox>(`${this.base}/address`, { domainId, localPart })
      .pipe(tap(() => this.resource.reload()));
  }

  reload(): void {
    this.resource.reload();
  }
}
