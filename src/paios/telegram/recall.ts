import type { KnowledgeRecord } from "../types.js";
import type { RecordListItem } from "../knowledge/records.js";

/**
 * Formatting for Phase 3 recency recall (A) and whole-record view (B). Pure
 * functions: no IO, no model. Inline action buttons are attached by the
 * assistant loop (ADR-0008), not here.
 */

export function formatRecallReply(items: RecordListItem[]): { text: string } {
  if (items.length === 0) {
    return { text: "I didn't find any matching records yet." };
  }
  const lines = items.map((item) => {
    const when = item.capturedAt.slice(0, 16).replace("T", " ");
    const label = item.title ?? item.sourceType;
    return `• ${item.id} — ${label} (${item.sourceType}, ${when})`;
  });
  return { text: ["Most recent first:", ...lines].join("\n") };
}

/** Telegram messages cap at 4096 chars; stay safely under with a margin. */
export const defaultViewMaxChars = 3500;

export function formatRecordView(
  record: KnowledgeRecord,
  maxChars = defaultViewMaxChars,
): string {
  const header = [
    `Record ${record.id}`,
    `Type: ${record.sourceType}`,
    `State: ${record.state}`,
    `Captured: ${record.capturedAt}`,
    `Source: ${record.sourceReference}`,
  ].join("\n");
  const body = record.normalizedText.trim();
  if (body.length === 0) {
    return `${header}\n\n(no text content)`;
  }
  const bounded =
    body.length > maxChars ? `${body.slice(0, maxChars)}\n…(truncated)` : body;
  return `${header}\n\n${bounded}`;
}
