/**
 * Transport-neutral messaging boundary (ADR-0005).
 *
 * Core capture/ask logic depends only on these types and the MessagingProvider
 * interface. Telegram-specific types never cross into storage, search, or
 * transcription; provider identity is carried as record provenance.
 */

export type MessageKind =
  | "text"
  | "voice"
  | "audio"
  | "document"
  | "unsupported";

export interface Workspace {
  channel: "telegram";
  chatId: string;
  threadId?: string;
}

export interface InboundAttachment {
  /** Opaque provider handle used to download bytes (Telegram file_id). */
  reference: string;
  /** Stable provider-side content identity (Telegram file_unique_id). */
  uniqueReference?: string;
  originalName?: string;
  claimedMimeType?: string;
  byteLength?: number;
}

export interface InboundMessage {
  provider: "telegram";
  messageId: string;
  workspace: Workspace;
  senderId: string;
  kind: MessageKind;
  text?: string;
  attachment?: InboundAttachment;
  timestamp: string;
  /** Provider delivery cursor; acknowledged only after durable processing. */
  cursor: string;
}

export interface OutboundReply {
  workspace: Workspace;
  text: string;
}

export interface MessagingProvider {
  poll(timeoutSeconds: number): Promise<InboundMessage[]>;
  sendReply(reply: OutboundReply): Promise<void>;
  downloadAttachment(attachment: InboundAttachment): Promise<Uint8Array>;
  acknowledge(cursor: string): Promise<void>;
}

/** Persists the long-poll delivery cursor so a restart resumes in order. */
export interface CursorStore {
  read(): string | null;
  write(cursor: string): void;
}

export function workspaceKey(workspace: Workspace): string {
  const base = `${workspace.channel}:${workspace.chatId}`;
  return workspace.threadId === undefined
    ? base
    : `${base}:${workspace.threadId}`;
}
