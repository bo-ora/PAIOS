import type { InboundMessage } from "./messaging.js";

/**
 * The complete Phase 2 command surface: capture, ask, inspect, help.
 *
 * There is no state-changing or system intent. Any text that is not an explicit
 * ask/inspect/help command is captured as a note, so no command path exists
 * that could mutate state or run anything.
 */
export type Intent =
  | { kind: "capture" }
  | { kind: "ask"; question: string }
  | { kind: "inspect"; recordId: string }
  | { kind: "help" };

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

  return { kind: "capture" };
}
