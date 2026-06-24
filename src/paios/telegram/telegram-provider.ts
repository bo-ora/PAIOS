import type { FetchLike } from "../http-fetch.js";
import type { TelegramConfig } from "./config.js";
import type {
  CursorStore,
  InboundAttachment,
  InboundMessage,
  MessagingProvider,
  Workspace,
} from "./messaging.js";

/**
 * Telegram Bot API adapter built on the built-in fetch boundary (ADR-0005).
 *
 * The bot token appears only inside request URLs; it is never returned in data
 * or included in thrown error messages.
 */

interface RawFile {
  file_id?: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface RawMessage {
  message_id?: number;
  chat?: { id?: number | string };
  from?: { id?: number | string };
  date?: number;
  text?: string;
  caption?: string;
  voice?: RawFile;
  audio?: RawFile;
  document?: RawFile;
  message_thread_id?: number;
  is_topic_message?: boolean;
}

interface RawCallbackQuery {
  id?: string;
  from?: { id?: number | string };
  message?: RawMessage;
  data?: string;
}

interface RawUpdate {
  update_id?: number;
  message?: RawMessage;
  callback_query?: RawCallbackQuery;
}

function toAttachment(file: RawFile): InboundAttachment {
  return {
    reference: file.file_id ?? "",
    ...(file.file_unique_id === undefined
      ? {}
      : { uniqueReference: file.file_unique_id }),
    ...(file.file_name === undefined ? {} : { originalName: file.file_name }),
    ...(file.mime_type === undefined
      ? {}
      : { claimedMimeType: file.mime_type }),
    ...(file.file_size === undefined ? {} : { byteLength: file.file_size }),
  };
}

export function normalizeUpdate(
  update: unknown,
  allowed: ReadonlySet<string>,
): InboundMessage | null {
  if (typeof update !== "object" || update === null) {
    return null;
  }
  const raw = update as RawUpdate;
  if (typeof raw.update_id !== "number") {
    return null;
  }
  if (raw.callback_query !== undefined) {
    return normalizeCallbackQuery(raw, raw.callback_query, allowed);
  }
  const message = raw.message;
  if (message?.chat?.id === undefined) {
    return null;
  }
  const chatId = String(message.chat.id);
  if (!allowed.has(chatId)) {
    return null;
  }
  const senderId =
    message.from?.id === undefined ? chatId : String(message.from.id);
  const workspace: Workspace = {
    channel: "telegram",
    chatId,
    ...(message.is_topic_message === true &&
    message.message_thread_id !== undefined
      ? { threadId: String(message.message_thread_id) }
      : {}),
  };
  const base = {
    provider: "telegram" as const,
    messageId: String(message.message_id ?? raw.update_id),
    workspace,
    senderId,
    timestamp:
      message.date === undefined
        ? new Date(0).toISOString()
        : new Date(message.date * 1000).toISOString(),
    cursor: String(raw.update_id),
  };

  if (message.voice !== undefined) {
    return { ...base, kind: "voice", attachment: toAttachment(message.voice) };
  }
  if (message.audio !== undefined) {
    return { ...base, kind: "audio", attachment: toAttachment(message.audio) };
  }
  if (message.document !== undefined) {
    return {
      ...base,
      kind: "document",
      attachment: toAttachment(message.document),
    };
  }
  if (typeof message.text === "string") {
    return { ...base, kind: "text", text: message.text };
  }
  if (typeof message.caption === "string") {
    return { ...base, kind: "text", text: message.caption };
  }
  return { ...base, kind: "unsupported" };
}

function normalizeCallbackQuery(
  raw: RawUpdate,
  query: RawCallbackQuery,
  allowed: ReadonlySet<string>,
): InboundMessage | null {
  const chatRaw = query.message?.chat?.id;
  if (chatRaw === undefined || query.id === undefined) {
    return null;
  }
  const chatId = String(chatRaw);
  const senderId = query.from?.id === undefined ? chatId : String(query.from.id);
  // Enforce the allowlist on both the chat and the tapping user.
  if (!allowed.has(chatId) || !allowed.has(senderId)) {
    return null;
  }
  const workspace: Workspace = {
    channel: "telegram",
    chatId,
    ...(query.message?.is_topic_message === true &&
    query.message.message_thread_id !== undefined
      ? { threadId: String(query.message.message_thread_id) }
      : {}),
  };
  return {
    provider: "telegram",
    messageId: String(query.message?.message_id ?? raw.update_id),
    workspace,
    senderId,
    kind: "callback",
    callback: { payload: query.data ?? "", callbackId: query.id },
    timestamp: new Date(0).toISOString(),
    cursor: String(raw.update_id),
  };
}

function extractResultArray(payload: unknown): unknown[] {
  if (typeof payload === "object" && payload !== null) {
    const result = (payload as { result?: unknown }).result;
    if (Array.isArray(result)) {
      return result;
    }
  }
  return [];
}

function extractFilePath(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null) {
    const result = (payload as { result?: { file_path?: unknown } }).result;
    if (typeof result?.file_path === "string") {
      return result.file_path;
    }
  }
  return null;
}

export interface TelegramProviderOptions {
  config: TelegramConfig;
  cursorStore: CursorStore;
  fetch: FetchLike;
  apiBase?: string;
}

const defaultApiBase = "https://api.telegram.org";

export function createTelegramProvider(
  options: TelegramProviderOptions,
): MessagingProvider {
  const apiBase = options.apiBase ?? defaultApiBase;
  const token = options.config.botToken;
  const method = (name: string): string => `${apiBase}/bot${token}/${name}`;

  return {
    async poll(timeoutSeconds: number): Promise<InboundMessage[]> {
      const offset = options.cursorStore.read();
      const params = new URLSearchParams();
      if (offset !== null) {
        params.set("offset", offset);
      }
      params.set("timeout", String(timeoutSeconds));
      const response = await options.fetch(
        `${method("getUpdates")}?${params.toString()}`,
      );
      if (!response.ok) {
        throw new Error(
          `Telegram getUpdates failed with status ${response.status}.`,
        );
      }
      const updates = extractResultArray(await response.json());
      const messages: InboundMessage[] = [];
      for (const update of updates) {
        const normalized = normalizeUpdate(
          update,
          options.config.allowedChatIds,
        );
        if (normalized !== null) {
          messages.push(normalized);
        }
      }
      return messages;
    },

    acknowledge(cursor: string): Promise<void> {
      const next = Number.parseInt(cursor, 10);
      if (Number.isFinite(next)) {
        options.cursorStore.write(String(next + 1));
      }
      return Promise.resolve();
    },

    async sendReply(reply): Promise<void> {
      const body = JSON.stringify({
        chat_id: reply.workspace.chatId,
        text: reply.text,
        ...(reply.workspace.threadId === undefined
          ? {}
          : { message_thread_id: Number(reply.workspace.threadId) }),
        ...(reply.actions === undefined || reply.actions.length === 0
          ? {}
          : {
              reply_markup: {
                inline_keyboard: [
                  reply.actions.map((action) => ({
                    text: action.label,
                    callback_data: action.payload,
                  })),
                ],
              },
            }),
      });
      const response = await options.fetch(method("sendMessage"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (!response.ok) {
        throw new Error(
          `Telegram sendMessage failed with status ${response.status}.`,
        );
      }
    },

    async answerCallback(callbackId: string): Promise<void> {
      const response = await options.fetch(method("answerCallbackQuery"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackId }),
      });
      if (!response.ok) {
        throw new Error(
          `Telegram answerCallbackQuery failed with status ${response.status}.`,
        );
      }
    },

    async downloadAttachment(attachment): Promise<Uint8Array> {
      const fileResponse = await options.fetch(
        `${method("getFile")}?file_id=${encodeURIComponent(attachment.reference)}`,
      );
      if (!fileResponse.ok) {
        throw new Error(
          `Telegram getFile failed with status ${fileResponse.status}.`,
        );
      }
      const filePath = extractFilePath(await fileResponse.json());
      if (filePath === null) {
        throw new Error("Telegram getFile returned no file path.");
      }
      const download = await options.fetch(
        `${apiBase}/file/bot${token}/${filePath}`,
      );
      if (!download.ok) {
        throw new Error(
          `Telegram file download failed with status ${download.status}.`,
        );
      }
      return new Uint8Array(await download.arrayBuffer());
    },
  };
}
