import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Alias } from '../../shared/models';

@Service()
export class AliasService {
  private readonly http = inject(HttpClient);

  list(mailboxId: string): Observable<Alias[]> {
    return this.http.get<Alias[]>(`${environment.apiUrl}/mailboxes/${mailboxId}/aliases`);
  }
}
