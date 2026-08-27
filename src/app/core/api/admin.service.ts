import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { AdminAccount, AdminMailbox, DnsRecord } from '../../shared/models';

export type AccountStatus = 'pending' | 'active' | 'suspended';

@Service()
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin`;

  accounts(): Observable<AdminAccount[]> {
    return this.http.get<AdminAccount[]>(`${this.base}/accounts`);
  }

  setStatus(id: string, status: AccountStatus): Observable<AdminAccount> {
    return this.http.put<AdminAccount>(`${this.base}/accounts/${id}/status`, { status });
  }

  removeAccount(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/accounts/${id}`);
  }

  mailboxes(): Observable<AdminMailbox[]> {
    return this.http.get<AdminMailbox[]>(`${this.base}/mailboxes`);
  }

  resetPassword(id: string, password: string): Observable<void> {
    return this.http.put<void>(`${this.base}/mailboxes/${id}/password`, { password });
  }

  removeMailbox(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/mailboxes/${id}`);
  }

  // The DKIM value exists only once the seed has generated the key pair on a deployed instance.
  platformDns(id: string): Observable<DnsRecord[]> {
    return this.http.get<DnsRecord[]>(`${this.base}/platform-domains/${id}/dns`);
  }
}
