import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Folder } from '../../shared/models';

@Service()
export class FolderService {
  private readonly http = inject(HttpClient);

  private base(mailboxId: string): string {
    return `${environment.apiUrl}/mailboxes/${mailboxId}/folders`;
  }

  list(mailboxId: string): Observable<Folder[]> {
    return this.http.get<Folder[]>(this.base(mailboxId));
  }

  create(mailboxId: string, name: string, parent?: string): Observable<Folder> {
    return this.http.post<Folder>(this.base(mailboxId), { name, ...(parent ? { parent } : {}) });
  }

  rename(mailboxId: string, path: string, name: string): Observable<Folder> {
    return this.http.put<Folder>(`${this.base(mailboxId)}/rename`, { path, name });
  }

  remove(mailboxId: string, path: string): Observable<void> {
    return this.http.delete<void>(this.base(mailboxId), { body: { path } });
  }
}
