export interface Page<T> {
  readonly content: readonly T[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export interface DnsRecord {
  readonly type: string;
  readonly host: string;
  readonly value: string;
  readonly purpose: string;
}

export interface Domain {
  readonly id: string;
  readonly name: string;
  readonly dkimSelector: string;
  readonly verified: boolean;
  readonly verifiedAt: string | null;
  readonly active: boolean;
  readonly createdAt: string;
  readonly dnsRecords?: readonly DnsRecord[];
}

export type CheckStatus = 'ok' | 'missing' | 'mismatch';

export interface DnsCheck {
  readonly name: string;
  readonly status: CheckStatus;
  readonly expected: string;
  readonly found: string | null;
}

export interface DnsCheckReport {
  readonly domain: string;
  readonly checks: readonly DnsCheck[];
  readonly allOk: boolean;
}

export interface Mailbox {
  readonly id: string;
  readonly domainId: string;
  readonly address: string;
  readonly localPart: string;
  readonly quotaMb: number;
  readonly active: boolean;
  readonly createdAt: string;
  readonly platform: boolean;
  readonly deliverable: boolean;
}

export interface PlatformDomain {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

export type PrincipalKind = 'account' | 'mailbox';

export interface Me {
  readonly kind: PrincipalKind;
  readonly admin: boolean;
  readonly displayName: string | null;
  readonly loginEmail: string | null;
  readonly mailboxes: readonly Mailbox[];
  readonly platformAddress: string | null;
  readonly needsAddress: boolean;
  readonly suggestedLocalPart: string | null;
  readonly suggestedDomainId: string | null;
}

export interface Alias {
  readonly id: string;
  readonly source: string;
  readonly destination: string;
}

export interface AdminAccount {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly plan: string;
  readonly status: string;
  readonly createdAt: string;
  readonly domainCount: number;
  readonly mailboxCount: number;
}

export interface AdminMailbox {
  readonly id: string;
  readonly address: string;
  readonly accountId: string;
  readonly accountEmail: string;
  readonly domainKind: string;
  readonly quotaMb: number;
  readonly active: boolean;
  readonly lockedUntil: string | null;
  readonly createdAt: string;
}

export interface MessageSummary {
  readonly id: string;
  // The RFC Message-ID, which is what threads a reply.
  readonly messageId: string;
  // Set for a message this mailbox wrote: a Sent list shows who it went to, not the sender.
  readonly recipient: string | null;
  readonly threadId: string | null;
  readonly sender: string;
  readonly subject: string | null;
  readonly folder: string;
  readonly receivedAt: string;
  readonly read: boolean;
  readonly spamScore: number | null;
}

export interface MessageAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
}

export interface MessageDetail extends MessageSummary {
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly html: string | null;
  readonly text: string | null;
  readonly attachments: readonly MessageAttachment[];
}

export interface Folder {
  readonly path: string;
  readonly name: string;
  readonly parent: string | null;
  readonly total: number;
  readonly unread: number;
  // Owned by the mail server: cannot be renamed or deleted.
  readonly system: boolean;
  // The IMAP SPECIAL-USE flag, so Archive and Trash are found without matching on a name.
  readonly specialUse: string | null;
  readonly ruleCount: number;
}

export interface DraftAttachment {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface RulePreview {
  readonly supported: boolean;
  readonly total: number;
  readonly sample: readonly {
    id: string;
    sender: string;
    subject: string | null;
    receivedAt: string;
  }[];
}

export type RuleField = 'sender' | 'subject' | 'recipient';
export type RuleOperator = 'contains' | 'equals' | 'starts_with' | 'ends_with';
export type RuleAction = 'move_to' | 'mark_read' | 'forward' | 'discard';

export interface FolderRule {
  readonly id: string;
  readonly mailboxId: string;
  readonly position: number;
  readonly active: boolean;
  readonly conditionField: RuleField;
  readonly conditionOperator: RuleOperator;
  readonly conditionValue: string;
  readonly action: RuleAction;
  readonly targetFolder: string | null;
}

export interface WarmupStatus {
  readonly day: number;
  readonly dailyCap: number | null;
  readonly sentToday: number;
}
