import { getRecord } from "../knowledge/records.js";
import type { AudioProcessingOptions } from "../knowledge/audio-processing.js";
import type { AnswerSynthesisProvider } from "../synthesis/provider.js";
import { answerQuestion, formatAnswerReply } from "./ask.js";
import { captureMessage } from "./capture.js";
import { parseIntent } from "./intent.js";
import {
  workspaceKey,
  type InboundMessage,
  type MessagingProvider,
} from "./messaging.js";

/**
 * Telegram assistant loop (ADR-0005). Routes each message to capture/ask/inspect
 * and replies. A message is acknowledged only after it has been processed and a
 * reply sent, so a crash re-delivers rather than silently drops it. There is no
 * state-changing or system intent; command-looking text is captured as a note.
 */

export interface AssistantDeps {
  dataRoot: string;
  tempRoot: string;
  provider: MessagingProvider;
  synthesis: AnswerSynthesisProvider;
  audio?: AudioProcessingOptions;
  log?: (event: {
    event: string;
    workspace: string;
    outcome: string;
    recordId?: string;
  }) => void;
  pollTimeoutSeconds?: number;
}

const helpReply = [
  "I capture and answer from your local knowledge base.",
  "",
  "• Send text, a voice note, or a .md/.txt document to capture it.",
  "• /ask <question> (or start with ?) to get a source-backed answer.",
  "• /show <record-id> to inspect a stored record.",
].join("\n");

export async function processMessage(
  message: InboundMessage,
  deps: AssistantDeps,
): Promise<string> {
  const intent = parseIntent(message);

  if (intent.kind === "help") {
    return helpReply;
  }
  if (intent.kind === "ask") {
    const result = await answerQuestion(
      deps.dataRoot,
      intent.question,
      deps.synthesis,
    );
    return formatAnswerReply(result);
  }
  if (intent.kind === "inspect") {
    const record = getRecord(deps.dataRoot, intent.recordId);
    if (record === null) {
      return `Record not found: ${intent.recordId}`;
    }
    return [
      `Record ${record.id}`,
      `Type: ${record.sourceType}`,
      `State: ${record.state}`,
      `Captured: ${record.capturedAt}`,
      `Source: ${record.sourceReference}`,
    ].join("\n");
  }

  const result = await captureMessage(message, {
    dataRoot: deps.dataRoot,
    tempRoot: deps.tempRoot,
    provider: deps.provider,
    ...(deps.audio === undefined ? {} : { audio: deps.audio }),
  });
  return result.message;
}

export async function runAssistantOnce(deps: AssistantDeps): Promise<number> {
  const messages = await deps.provider.poll(deps.pollTimeoutSeconds ?? 25);
  for (const message of messages) {
    let reply: string;
    let outcome = "handled";
    try {
      reply = await processMessage(message, deps);
    } catch {
      outcome = "error";
      reply =
        "Something went wrong handling that message; it was not lost — please try again.";
    }
    await deps.provider.sendReply({ workspace: message.workspace, text: reply });
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
  while (control?.stop?.() !== true) {
    await runAssistantOnce(deps);
  }
}
