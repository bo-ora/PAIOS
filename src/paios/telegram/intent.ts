import type { KnowledgeSourceType } from "../types.js";
import type { Mode } from "./dialogue.js";
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
  | {
      kind: "summarize";
      recordId?: string;
      recent?: { sourceTypes?: KnowledgeSourceType[] };
    }
  | { kind: "set-mode"; mode: Mode }
  | { kind: "help" };

function recallSourceTypes(text: string): KnowledgeSourceType[] {
  // "voice note" is audio, not a note: voice/audio phrasing takes precedence.
  if (voicePattern.test(text)) {
    return ["audio"];
  }
  const types: KnowledgeSourceType[] = [];
  if (notePattern.test(text)) {
    types.push("note");
  }
  if (documentPattern.test(text)) {
    types.push("managed-file");
  }
  return types;
}

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

  if (text === "/grounded") {
    return { kind: "set-mode", mode: "grounded" };
  }
  if (text === "/assist" || text === "/chat") {
    return { kind: "set-mode", mode: "assist" };
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

  if (text === "/summarize" || /^summari[sz]e\b/i.test(text)) {
    const sourceTypes = recallSourceTypes(text);
    return {
      kind: "summarize",
      ...(sourceTypes.length > 0 ? { recent: { sourceTypes } } : {}),
    };
  }
  if (text.startsWith("/summarize ")) {
    const recordId = text.slice("/summarize ".length).trim();
    return recordId.length === 0
      ? { kind: "summarize" }
      : { kind: "summarize", recordId };
  }

  if (recencyPattern.test(text)) {
    const sourceTypes = recallSourceTypes(text);
    return {
      kind: "recall",
      ...(sourceTypes.length > 0 ? { sourceTypes } : {}),
    };
  }

  return { kind: "capture" };
}
