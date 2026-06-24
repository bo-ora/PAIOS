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
  | "callback"
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

/** A tapped inline button (Telegram callback_query), transport-neutral. */
export interface InboundCallback {
  /** The bounded action token carried on the button (e.g. "view:<id>"). */
  payload: string;
  /** Provider-side callback id, used to acknowledge the tap. */
  callbackId: string;
}

export interface InboundMessage {
  provider: "telegram";
  messageId: string;
  workspace: Workspace;
  senderId: string;
  kind: MessageKind;
  text?: string;
  attachment?: InboundAttachment;
  callback?: InboundCallback;
  timestamp: string;
  /** Provider delivery cursor; acknowledged only after durable processing. */
  cursor: string;
}

/** An inline action button rendered on a reply (ADR-0008). */
export interface RecordAction {
  /** Button label shown to the user, e.g. "👁 View". */
  label: string;
  /** Bounded action token (<= 64 bytes), e.g. "view:<id>" or "sum:<id>". */
  payload: string;
}

export interface OutboundReply {
  workspace: Workspace;
  text: string;
  /** Rendered as a single-row inline keyboard when present. */
  actions?: RecordAction[];
}

export interface MessagingProvider {
  poll(timeoutSeconds: number): Promise<InboundMessage[]>;
  sendReply(reply: OutboundReply): Promise<void>;
  downloadAttachment(attachment: InboundAttachment): Promise<Uint8Array>;
  acknowledge(cursor: string): Promise<void>;
  /** Acknowledge a tapped inline button so the client stops its spinner. */
  answerCallback?(callbackId: string): Promise<void>;
}

/** The supported inline-action verbs and their parsed shape. */
export interface CallbackPayload {
  action: "view" | "sum";
  recordId: string;
}

/**
 * Parse and validate an inline-button callback payload. Rejects anything that
 * is not a known verb plus a safe record id (`[A-Za-z0-9-]+`) within Telegram's
 * 64-byte callback_data limit. Untrusted input: never trust the token's shape.
 */
export function parseCallbackPayload(payload: string): CallbackPayload | null {
  if (payload.length === 0 || payload.length > 64) {
    return null;
  }
  const match = /^(view|sum):([A-Za-z0-9-]+)$/.exec(payload);
  if (match === null) {
    return null;
  }
  return { action: match[1] as CallbackPayload["action"], recordId: match[2]! };
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
