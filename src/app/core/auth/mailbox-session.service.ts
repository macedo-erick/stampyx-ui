import { HttpClient } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { type Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';

interface SessionResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly address: string;
}

interface StoredSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly address: string;
  readonly expiresAt: number;
}

const STORAGE_KEY = 'stampyx.mailbox-session';
const RENEW_MARGIN_MS = 60_000;

@Service()
export class MailboxSessionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth/mailbox`;
  private readonly session = signal<StoredSession | null>(restore());
  private renewal: ReturnType<typeof setTimeout> | null = null;

  readonly token = computed(() => this.session()?.accessToken ?? null);
  readonly address = computed(() => this.session()?.address ?? null);
  readonly isActive = computed(() => this.session() !== null);

  constructor() {
    this.scheduleRenewal();
  }

  login(email: string, password: string): Observable<SessionResponse> {
    return this.http
      .post<SessionResponse>(`${this.base}/login`, { email, password })
      .pipe(tap((response) => this.store(response)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.put<void>(`${this.base}/password`, { currentPassword, newPassword });
  }

  refresh(): Observable<SessionResponse> {
    const refreshToken = this.session()?.refreshToken ?? '';

    return this.http
      .post<SessionResponse>(`${this.base}/refresh`, { refreshToken })
      .pipe(tap((response) => this.store(response)));
  }

  logout(): void {
    const refreshToken = this.session()?.refreshToken;

    if (refreshToken !== undefined) {
      this.http.post(`${this.base}/logout`, { refreshToken }).subscribe({ error: () => undefined });
    }

    this.clear();
  }

  clear(): void {
    this.session.set(null);
    this.cancelRenewal();
    safeRemove();
  }

  private store(response: SessionResponse): void {
    const stored: StoredSession = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      address: response.address,
      expiresAt: Date.now() + response.expiresIn * 1000,
    };

    this.session.set(stored);
    safeWrite(stored);
    this.scheduleRenewal();
  }

  private scheduleRenewal(): void {
    this.cancelRenewal();

    const current = this.session();

    if (current === null) {
      return;
    }

    const delay = Math.max(current.expiresAt - Date.now() - RENEW_MARGIN_MS, 0);

    this.renewal = setTimeout(() => {
      this.refresh().subscribe({ error: () => this.clear() });
    }, delay);
  }

  private cancelRenewal(): void {
    if (this.renewal !== null) {
      clearTimeout(this.renewal);
      this.renewal = null;
    }
  }
}

function restore(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredSession;

    return parsed.expiresAt > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function safeWrite(session: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    return;
  }
}

function safeRemove(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}
