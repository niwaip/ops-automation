/**
 * Built-in Email Skill Types & Interfaces
 * Conforms to docs/design/email-skill/00-architecture-and-boundaries.md & 01-capability-contracts.md
 */

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailAddressInput {
  name?: string;
  address: string;
}

export interface EmailAttachmentSummary {
  attachmentRef?: string;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  inline?: boolean;
}

export interface NormalizedEmailMessage {
  messageRef: string;
  threadRef?: string;
  internetMessageId?: string;
  folder: 'inbox' | 'sent' | 'drafts' | 'archive' | 'other';
  subject: string;
  from?: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  receivedAt?: string;
  sentAt?: string;
  isRead: boolean;
  importance?: 'low' | 'normal' | 'high';
  labels?: string[];
  snippet?: string;
  body?: {
    format: 'text' | 'sanitized_html';
    content?: string;
    artifactRef?: string;
    truncated: boolean;
  };
  attachments: EmailAttachmentSummary[];
  contentTrust: 'untrusted_external';
}

export interface EmailMessagesInput {
  mailboxKey?: string;
  selector:
    | {
        kind: 'recent';
        folder?: 'inbox' | 'sent' | 'drafts' | 'archive' | 'all';
        unreadOnly?: boolean;
        since?: string;
        until?: string;
      }
    | {
        kind: 'search';
        text?: string;
        filters?: {
          from?: string[];
          to?: string[];
          subjectContains?: string;
          hasAttachment?: boolean;
          unreadOnly?: boolean;
          since?: string;
          until?: string;
          folder?: 'inbox' | 'sent' | 'drafts' | 'archive' | 'all';
        };
      }
    | {
        kind: 'by_ref';
        messageRef: string;
      };
  detail?: 'summary' | 'full';
  limit?: number;
  cursor?: string;
}

export interface EmailMessagesOutput {
  mailboxKey: string;
  items: NormalizedEmailMessage[];
  resultCount: number;
  nextCursor?: string;
  fetchedAt: string;
  warnings: string[];
}

export interface EmailSendInput {
  mailboxKey?: string;
  mode?: 'new' | 'reply';
  to: EmailAddressInput[];
  cc?: EmailAddressInput[];
  bcc?: EmailAddressInput[];
  subject?: string;
  textBody: string;
  replyToMessageRef?: string;
  clientRequestKey?: string;
}

export interface EmailSendOutput {
  deliveryId: string;
  state: 'accepted' | 'unknown';
  providerMessageRef?: string;
  acceptedAt: string;
  warnings?: string[];
}

export interface EmailUpdateInput {
  mailboxKey?: string;
  messageRefs?: string[];
  isRead?: boolean;
  selector?: EmailMessagesInput['selector'];
  prompt?: string;
}

export interface EmailUpdateOutput {
  mailboxKey: string;
  updatedCount: number;
  messageRefs: string[];
  isRead: boolean;
  success: boolean;
  updatedAt: string;
  updatedTitles?: string[];
  warnings?: string[];
}

export interface EmailConnectionConfig {
  providerType?: 'smtp_imap' | 'gmail_oauth' | 'outlook_oauth' | 'microsoft_oauth';
  authType?: 'password' | 'xoauth2';
  emailAddress?: string;
  authPassword?: string;
  accessToken?: string;
  refreshToken?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  senderName?: string;
  timeoutMs?: number;
}

export interface EmailProviderAdapter {
  readonly provider: string;
  isConfigured(config: EmailConnectionConfig): boolean;
  testConnection(config: EmailConnectionConfig): Promise<{ success: boolean; message: string }>;
  listMessages(
    input: EmailMessagesInput,
    config: EmailConnectionConfig
  ): Promise<EmailMessagesOutput>;
  sendMessage(input: EmailSendInput, config: EmailConnectionConfig): Promise<EmailSendOutput>;
  updateMessages?(
    input: EmailUpdateInput,
    config: EmailConnectionConfig
  ): Promise<EmailUpdateOutput>;
}
