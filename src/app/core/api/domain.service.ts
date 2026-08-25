import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { DnsCheckReport, Domain, Mailbox } from '../../shared/models';

@Service()
export class DomainService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/domains`;

  list(): Observable<Domain[]> {
    return this.http.get<Domain[]>(this.base);
  }

  get(id: string): Observable<Domain> {
    return this.http.get<Domain>(`${this.base}/${id}`);
  }

  create(name: string): Observable<Domain> {
    return this.http.post<Domain>(this.base, { name });
  }

  check(id: string): Observable<DnsCheckReport> {
    return this.http.get<DnsCheckReport>(`${this.base}/${id}/dns-check`);
  }

  verify(id: string): Observable<Domain> {
    return this.http.post<Domain>(`${this.base}/${id}/verify`, {});
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  mailboxes(domainId: string): Observable<Mailbox[]> {
    return this.http.get<Mailbox[]>(`${this.base}/${domainId}/mailboxes`);
  }

  createMailbox(
    domainId: string,
    body: { localPart: string; password: string; quotaMb?: number },
  ): Observable<Mailbox> {
    return this.http.post<Mailbox>(`${this.base}/${domainId}/mailboxes`, body);
  }
}
