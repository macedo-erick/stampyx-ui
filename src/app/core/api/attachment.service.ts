import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { DraftAttachment } from '../../shared/models';

@Service()
export class AttachmentService {
  private readonly http = inject(HttpClient);

  private base(mailboxId: string): string {
    return `${environment.apiUrl}/mailboxes/${mailboxId}/attachments`;
  }

  upload(mailboxId: string, file: File): Observable<DraftAttachment> {
    const form = new FormData();
    form.append('file', file, file.name);

    return this.http.post<DraftAttachment>(this.base(mailboxId), form);
  }

  remove(mailboxId: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(mailboxId)}/${id}`);
  }
}
