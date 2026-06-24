import type { KnowledgeSourceType } from "../types.js";
import type { InboundMessage } from "./messaging.js";

/**
 * The Phase 2 command surface (capture, ask, inspect, help) plus the Phase 3
 * conversational-recall intents (recall, ...). There is still no state-changing
 * or system intent: any text that is not an explicit command is captured as a
 * note, so no command path exists that could mutate state or run anything.
 */
export type Intent =
  | { kind: "capture" }
  | { kind: "ask"; question: string }
  | { kind: "inspect"; recordId: string }
  | { kind: "recall"; sourceTypes?: KnowledgeSourceType[] }
  | { kind: "help" };

// Recency/metadata recall (ADR-0008, Phase 3 A): anchored structural phrases so
// ordinary notes are not hijacked. Content questions still reach `ask`/capture.
const recencyPattern =
  /^(\/recent|\/latest|latest|recent|my (recent|last)\b|what did i capture)\b/i;
const voicePattern = /\b(voice|audio|recording|transcript)s?\b/i;
const notePattern = /\bnotes?\b/i;
const documentPattern = /\b(documents?|files?)\b/i;

export function parseIntent(message: InboundMessage): Intent {
  if (message.kind !== "text" || message.text === undefined) {
    return { kind: "capture" };
  }
  const text = message.text.trim();
  if (text.length === 0) {
    return { kind: "help" };
  }

  if (text === "/start" || text === "/help") {
    return { kind: "help" };
  }

  if (text.startsWith("/ask ") || text.startsWith("?")) {
    const question = (text.startsWith("?")
      ? text.slice(1)
      : text.slice("/ask ".length)
    ).trim();
    return question.length === 0 ? { kind: "help" } : { kind: "ask", question };
  }
  if (text === "/ask") {
    return { kind: "help" };
  }

  if (text.startsWith("/show ")) {
    const recordId = text.slice("/show ".length).trim();
    return recordId.length === 0
      ? { kind: "help" }
      : { kind: "inspect", recordId };
  }

  if (recencyPattern.test(text)) {
    // "voice note" is audio, not a note: voice/audio phrasing takes precedence.
    const sourceTypes: KnowledgeSourceType[] = [];
    if (voicePattern.test(text)) {
      sourceTypes.push("audio");
    } else {
      if (notePattern.test(text)) {
        sourceTypes.push("note");
      }
      if (documentPattern.test(text)) {
        sourceTypes.push("managed-file");
      }
    }
    return {
      kind: "recall",
      ...(sourceTypes.length > 0 ? { sourceTypes } : {}),
    };
  }

  return { kind: "capture" };
}
