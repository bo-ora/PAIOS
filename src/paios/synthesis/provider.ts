/**
 * Answer-synthesis boundary (ADR-0006).
 *
 * Core ask logic depends only on these types and the AnswerSynthesisProvider
 * interface. The Phase 2 adapter is local-only (Ollama); a cloud adapter is a
 * separate, disclosed future decision.
 */

export interface RetrievedRecord {
  recordId: string;
  title: string | null;
  sourceReference: string;
  text: string;
}

export interface SynthesisRequest {
  question: string;
  records: RetrievedRecord[];
}

export type SynthesisOutcome = "answered" | "no-sources" | "refused";

export interface SynthesisResult {
  outcome: SynthesisOutcome;
  answer: string;
  citedRecordIds: string[];
}

export interface AnswerSynthesisProvider {
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
}

/**
 * Convert a natural-language question into a safe FTS5 query: lowercase,
 * extract alphanumeric tokens of length >= 2, dedupe, quote each (so no token
 * is interpreted as an FTS operator), and OR them for recall. Returns the empty
 * string when nothing usable remains; the caller treats that as no sources.
 */
export function toSearchQuery(question: string): string {
  const tokens = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const token of tokens) {
    if (token.length < 2 || seen.has(token)) {
      continue;
    }
    seen.add(token);
    kept.push(token);
  }
  return kept.map((token) => `"${token}"`).join(" OR ");
}

const synthesisSystemPrompt = [
  "You are a personal knowledge assistant.",
  "Answer the user's question using ONLY the numbered sources provided.",
  "Cite every claim inline with the source's record id in square brackets, e.g. [<record-id>].",
  "Do not use any knowledge that is not in the sources.",
  "If the sources do not contain the answer, say plainly that you cannot answer from the stored knowledge — do not guess or invent details.",
].join(" ");

export function buildSynthesisPrompt(request: SynthesisRequest): {
  system: string;
  user: string;
} {
  const sources = request.records
    .map((record, index) => {
      const heading = `Source ${index + 1} — record ${record.recordId}${
        record.title === null ? "" : ` (${record.title})`
      } [${record.sourceReference}]`;
      return `${heading}\n${record.text}`;
    })
    .join("\n\n");
  const user = [
    `Question: ${request.question}`,
    "",
    "Sources:",
    sources,
  ].join("\n");
  return { system: synthesisSystemPrompt, user };
}

/**
 * Return the record ids that actually appear in the answer text, in record
 * order, ignoring any cited id that is not among the supplied records.
 */
export function extractCitations(
  answer: string,
  records: RetrievedRecord[],
): string[] {
  const cited: string[] = [];
  for (const record of records) {
    if (answer.includes(record.recordId) && !cited.includes(record.recordId)) {
      cited.push(record.recordId);
    }
  }
  return cited;
}
