import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  FolderRule,
  RulePreview,
  RuleAction,
  RuleField,
  RuleOperator,
} from '../../shared/models';

export interface RuleBody {
  conditionField: RuleField;
  conditionOperator: RuleOperator;
  conditionValue: string;
  action: RuleAction;
  targetFolder: string | null;
  active: boolean;
}

@Service()
export class RuleService {
  private readonly http = inject(HttpClient);

  private base(mailboxId: string): string {
    return `${environment.apiUrl}/mailboxes/${mailboxId}/rules`;
  }

  list(mailboxId: string): Observable<FolderRule[]> {
    return this.http.get<FolderRule[]>(this.base(mailboxId));
  }

  create(mailboxId: string, body: RuleBody): Observable<FolderRule> {
    return this.http.post<FolderRule>(this.base(mailboxId), body);
  }

  update(mailboxId: string, id: string, body: RuleBody): Observable<FolderRule> {
    return this.http.put<FolderRule>(`${this.base(mailboxId)}/${id}`, body);
  }

  reorder(mailboxId: string, ruleIds: string[]): Observable<FolderRule[]> {
    return this.http.put<FolderRule[]>(`${this.base(mailboxId)}/order`, { ruleIds });
  }

  preview(
    mailboxId: string,
    body: { conditionField: RuleField; conditionOperator: RuleOperator; conditionValue: string },
  ): Observable<RulePreview> {
    return this.http.post<RulePreview>(`${this.base(mailboxId)}/preview`, body);
  }

  remove(mailboxId: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(mailboxId)}/${id}`);
  }
}
