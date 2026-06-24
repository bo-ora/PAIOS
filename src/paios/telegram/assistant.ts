import { getRecord, listRecords } from "../knowledge/records.js";
import type { AudioProcessingOptions } from "../knowledge/audio-processing.js";
import type { AnswerSynthesisProvider } from "../synthesis/provider.js";
import {
  handleConversation,
  summarizeRecords,
  type SummarizeOutcome,
} from "./ask.js";
import { captureMessage } from "./capture.js";
import { createDialogueStore, type DialogueStore } from "./dialogue.js";
import { parseIntent } from "./intent.js";
import { formatRecallReply, formatRecordView } from "./recall.js";
import {
  parseCallbackPayload,
  workspaceKey,
  type InboundMessage,
  type MessagingProvider,
  type RecordAction,
  type Workspace,
} from "./messaging.js";

/**
 * Telegram assistant loop (ADR-0005, extended for Phase 3). Routes each message
 * to capture/recall/view/summarize/ask, mode toggles, and tapped inline
 * actions, then replies. A message is acknowledged only after it has been
 * processed and a reply sent, so a crash re-delivers rather than silently drops
 * it. There is still no state-changing or system intent.
 */

export interface AssistantDeps {
  dataRoot: string;
  tempRoot: string;
  provider: MessagingProvider;
  synthesis: AnswerSynthesisProvider;
  dialogue?: DialogueStore;
  audio?: AudioProcessingOptions;
  log?: (event: {
    event: string;
    workspace: string;
    outcome: string;
    recordId?: string;
  }) => void;
  pollTimeoutSeconds?: number;
}

interface ProcessedReply {
  text: string;
  actions?: RecordAction[];
}

const helpReply = [
  "I capture and answer from your local knowledge base, and we can talk it through.",
  "",
  "Capture:",
  "• Send text (in grounded mode), a voice note, or a .md/.txt document.",
  "",
  "Recall & view:",
  "• 'recent', 'latest', 'my last voice note', 'what did I capture today' — list records (no model).",
  "• /show <id> — view a stored record in full. Tap 👁 View / 📝 Summarize on a confirmation or listing.",
  "• /summarize <id> (or 'summarize my recent notes') — summarize records.",
  "",
  "Ask & chat:",
  "• /ask <question> (or start with ?) — a source-backed grounded answer.",
  "• /assist (or /chat) — open conversation mode; /grounded — back to cited-only answers.",
  "  In grounded mode (default) plain text is captured as a note; in assist mode it's a conversation.",
].join("\n");

function viewSummarizeActions(recordId: string): RecordAction[] {
  return [
    { label: "👁 View", payload: `view:${recordId}` },
    { label: "📝 Summarize", payload: `sum:${recordId}` },
  ];
}

function formatSummaryReply(outcome: SummarizeOutcome): string {
  if (outcome.outcome === "no-records") {
    return "I couldn't find that record to summarize.";
  }
  const sources = outcome.recordIds.map((id) => `- ${id}`).join("\n");
  return outcome.summary.trim().length === 0
    ? "I couldn't produce a summary from that."
    : `${outcome.summary}\n\nSources:\n${sources}`;
}

function workspaceScope(workspace: Workspace): {
  chatId: string;
  threadId?: string;
} {
  return {
    chatId: workspace.chatId,
    ...(workspace.threadId === undefined ? {} : { threadId: workspace.threadId }),
  };
}

async function handleCallback(
  message: InboundMessage,
  deps: AssistantDeps,
  store: DialogueStore,
  key: string,
): Promise<ProcessedReply> {
  const callback = message.callback;
  if (callback !== undefined && deps.provider.answerCallback !== undefined) {
    await deps.provider.answerCallback(callback.callbackId);
  }
  const payload =
    callback === undefined ? null : parseCallbackPayload(callback.payload);
  if (payload === null) {
    return { text: "That action is no longer available." };
  }
  if (payload.action === "view") {
    const record = getRecord(deps.dataRoot, payload.recordId);
    if (record === null) {
      return { text: `Record not found: ${payload.recordId}` };
    }
    store.setLastRecordId(key, record.id);
    return { text: formatRecordView(record) };
  }
  const outcome = await summarizeRecords(
    deps.dataRoot,
    { recordId: payload.recordId },
    deps.synthesis,
  );
  return { text: formatSummaryReply(outcome) };
}

export async function processMessage(
  message: InboundMessage,
  deps: AssistantDeps,
): Promise<ProcessedReply> {
  const store = deps.dialogue ?? createDialogueStore();
  const key = workspaceKey(message.workspace);

  if (message.kind === "callback") {
    return handleCallback(message, deps, store, key);
  }

  const intent = parseIntent(message);

  if (intent.kind === "help") {
    return { text: helpReply };
  }
  if (intent.kind === "set-mode") {
    store.setMode(key, intent.mode);
    return {
      text:
        intent.mode === "assist"
          ? "🗣 Assist mode on for this chat — I'll converse openly but won't claim personal facts without checking your notes. Send /grounded to switch back."
          : "📚 Grounded mode on — I'll answer only from your cited records and refuse otherwise.",
    };
  }
  if (intent.kind === "inspect") {
    const record = getRecord(deps.dataRoot, intent.recordId);
    if (record === null) {
      return { text: `Record not found: ${intent.recordId}` };
    }
    store.setLastRecordId(key, record.id);
    return { text: formatRecordView(record) };
  }
  if (intent.kind === "recall") {
    const items = listRecords(deps.dataRoot, {
      ...(intent.sourceTypes === undefined
        ? {}
        : { sourceTypes: intent.sourceTypes }),
      workspace: workspaceScope(message.workspace),
    });
    const reply = formatRecallReply(items);
    const top = items[0];
    return top === undefined
      ? { text: reply.text }
      : { text: reply.text, actions: viewSummarizeActions(top.id) };
  }
  if (intent.kind === "summarize") {
    let selector;
    if (intent.recordId !== undefined) {
      selector = { recordId: intent.recordId } as const;
    } else if (intent.recent !== undefined) {
      selector = { recent: intent.recent } as const;
    } else {
      const last = store.lastRecordId(key);
      if (last === undefined) {
        return {
          text: "Tell me what to summarize — e.g. /summarize <id>, 'summarize my recent notes', or view a record first.",
        };
      }
      selector = { recordId: last } as const;
    }
    const outcome = await summarizeRecords(deps.dataRoot, selector, deps.synthesis);
    return { text: formatSummaryReply(outcome) };
  }
  if (intent.kind === "ask") {
    return { text: await handleConversation(deps, key, intent.question, store) };
  }

  // Plain text: capture in grounded mode (Phase 2 behaviour), converse in
  // assist mode. Non-text (voice/audio/document) is always captured.
  if (message.kind === "text" && store.getMode(key) === "assist") {
    return {
      text: await handleConversation(deps, key, message.text ?? "", store),
    };
  }

  const result = await captureMessage(message, {
    dataRoot: deps.dataRoot,
    tempRoot: deps.tempRoot,
    provider: deps.provider,
    ...(deps.audio === undefined ? {} : { audio: deps.audio }),
  });
  if (result.recordId !== undefined) {
    store.setLastRecordId(key, result.recordId);
    return { text: result.message, actions: viewSummarizeActions(result.recordId) };
  }
  return { text: result.message };
}

export async function runAssistantOnce(deps: AssistantDeps): Promise<number> {
  const store = deps.dialogue ?? createDialogueStore();
  const depsWithStore: AssistantDeps = { ...deps, dialogue: store };
  const messages = await deps.provider.poll(deps.pollTimeoutSeconds ?? 25);
  for (const message of messages) {
    let reply: ProcessedReply;
    let outcome = "handled";
    try {
      reply = await processMessage(message, depsWithStore);
    } catch {
      outcome = "error";
      reply = {
        text: "Something went wrong handling that message; it was not lost — please try again.",
      };
    }
    await deps.provider.sendReply({
      workspace: message.workspace,
      text: reply.text,
      ...(reply.actions === undefined ? {} : { actions: reply.actions }),
    });
    deps.log?.({
      event: "message",
      workspace: workspaceKey(message.workspace),
      outcome,
    });
    // Acknowledge only after a reply is sent so a crash re-delivers.
    await deps.provider.acknowledge(message.cursor);
  }
  return messages.length;
}

export async function runAssistant(
  deps: AssistantDeps,
  control?: { stop?: () => boolean },
): Promise<void> {
  const store = deps.dialogue ?? createDialogueStore();
  const depsWithStore: AssistantDeps = { ...deps, dialogue: store };
  while (control?.stop?.() !== true) {
    await runAssistantOnce(depsWithStore);
  }
}
