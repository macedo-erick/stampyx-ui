import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { MessageDetail, MessageSummary, Page } from '../../shared/models';

export interface SendMessageBody {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  attachmentIds?: string[];
  replacesDraftId?: string;
}

@Service()
export class MessageService {
  private readonly http = inject(HttpClient);

  private base(mailboxId: string): string {
    return `${environment.apiUrl}/mailboxes/${mailboxId}/messages`;
  }

  list(mailboxId: string, folder: string, page = 0, size = 25): Observable<Page<MessageSummary>> {
    const params = new HttpParams().set('folder', folder).set('page', page).set('size', size);

    return this.http.get<Page<MessageSummary>>(this.base(mailboxId), { params });
  }

  read(mailboxId: string, id: string): Observable<MessageDetail> {
    return this.http.get<MessageDetail>(`${this.base(mailboxId)}/${id}`);
  }

  send(mailboxId: string, body: SendMessageBody): Observable<{ messageId: string }> {
    return this.http.post<{ messageId: string }>(this.base(mailboxId), body);
  }

  // Never reaches the MTA: composed and appended straight into Drafts.
  saveDraft(mailboxId: string, body: SendMessageBody): Observable<void> {
    return this.http.post<void>(`${this.base(mailboxId)}/drafts`, body);
  }

  // The whole conversation oldest first, marked read on the way: one call, not a read plus a thread.
  thread(mailboxId: string, id: string): Observable<MessageDetail[]> {
    return this.http.get<MessageDetail[]>(`${this.base(mailboxId)}/${id}/thread`);
  }

  // Through HttpClient, not a link: the endpoint needs a bearer token an <a href> cannot carry.
  attachment(mailboxId: string, id: string, index: number): Observable<Blob> {
    return this.http.get(
      `${this.base(mailboxId)}/${encodeURIComponent(id)}/attachments/${String(index)}`,
      { responseType: 'blob' },
    );
  }

  setRead(mailboxId: string, id: string, read: boolean): Observable<void> {
    return this.http.put<void>(`${this.base(mailboxId)}/${id}/read`, { read });
  }

  move(mailboxId: string, id: string, folder: string): Observable<void> {
    return this.http.put<void>(`${this.base(mailboxId)}/${id}/folder`, { folder });
  }

  remove(mailboxId: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(mailboxId)}/${id}`);
  }
}
