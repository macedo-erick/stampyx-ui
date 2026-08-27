import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { MessageDetail, MessageSummary, Page } from '../../shared/models';

export interface BulkResult {
  readonly processed: readonly string[];
  readonly failed: readonly string[];
}

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

  saveDraft(mailboxId: string, body: SendMessageBody): Observable<void> {
    return this.http.post<void>(`${this.base(mailboxId)}/drafts`, body);
  }

  thread(mailboxId: string, id: string): Observable<MessageDetail[]> {
    return this.http.get<MessageDetail[]>(`${this.base(mailboxId)}/${id}/thread`);
  }

  attachment(mailboxId: string, id: string, index: number): Observable<Blob> {
    return this.http.get(
      `${this.base(mailboxId)}/${encodeURIComponent(id)}/attachments/${String(index)}`,
      { responseType: 'blob' },
    );
  }

  bulkRead(mailboxId: string, ids: readonly string[], read: boolean): Observable<BulkResult> {
    return this.http.put<BulkResult>(`${this.base(mailboxId)}/bulk/read`, { ids, read });
  }

  bulkMove(mailboxId: string, ids: readonly string[], folder: string): Observable<BulkResult> {
    return this.http.put<BulkResult>(`${this.base(mailboxId)}/bulk/folder`, { ids, folder });
  }

  bulkRemove(mailboxId: string, ids: readonly string[]): Observable<BulkResult> {
    return this.http.post<BulkResult>(`${this.base(mailboxId)}/bulk/delete`, { ids });
  }

  remove(mailboxId: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(mailboxId)}/${id}`);
  }
}
