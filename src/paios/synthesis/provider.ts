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

export interface SummarizeRequest {
  records: RetrievedRecord[];
}

export interface SummarizeResult {
  summary: string;
  recordIds: string[];
}

export interface AnswerSynthesisProvider {
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
  /**
   * Generative summary over the user's own selected records (ADR-0008, Phase
   * 3 B). Distinct from grounded Q&A: it transforms the given content and must
   * not add facts not present in it.
   */
  summarize(request: SummarizeRequest): Promise<SummarizeResult>;
}

// Common English function words carry no retrieval signal and, OR-ed together,
// cause unrelated records to match. Dropping them keeps "no relevant source"
// questions from spuriously retrieving content.
const stopwords = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "am",
  "do", "does", "did", "have", "has", "had",
  "what", "which", "who", "whom", "whose", "where", "when", "why", "how",
  "my", "your", "our", "their", "his", "her", "its", "this", "that", "these",
  "those", "it", "i", "you", "we", "they", "he", "she",
  "me", "us", "them", "him",
  "can", "could", "should", "would", "will", "shall", "may", "might", "must",
  "about", "into", "from", "by", "as", "if", "so", "than", "then",
]);

/**
 * Convert a natural-language question into a safe FTS5 query: lowercase,
 * extract alphanumeric tokens of length >= 2, drop common stopwords, dedupe,
 * quote each (so no token is interpreted as an FTS operator), and OR them for
 * recall. Returns the empty string when nothing usable remains; the caller
 * treats that as no sources.
 */
export function toSearchQuery(question: string): string {
  const tokens = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const token of tokens) {
    if (token.length < 2 || stopwords.has(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    kept.push(token);
  }
  return kept.map((token) => `"${token}"`).join(" OR ");
}

const synthesisSystemPrompt = [
  "You are the user's private personal knowledge assistant.",
  "The numbered sources are the user's OWN notes that they captured and are asking you to recall for them.",
  "Answer the user's question directly using ONLY those sources, including any personal details they recorded (names, numbers, dates) — it is their own information, so do not refuse or withhold it.",
  "Cite every claim inline with the source's record id in square brackets, e.g. [<record-id>].",
  "Do not use any knowledge that is not in the sources.",
  "If the sources do not contain the answer, say plainly that you cannot find it in their stored knowledge — do not guess or invent details.",
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

const summarySystemPrompt = [
  "You are the user's private personal knowledge assistant.",
  "Summarize the user's OWN records below faithfully and concisely.",
  "Use ONLY what the records contain; do not add, invent, or infer facts that are not present.",
  "Preserve concrete personal details (names, numbers, dates) exactly as written — it is the user's own information.",
  "Write a plain-language summary; if the records are already brief, a one-line summary is fine.",
].join(" ");

export function buildSummaryPrompt(request: SummarizeRequest): {
  system: string;
  user: string;
} {
  const sources = request.records
    .map((record, index) => {
      const heading = `Record ${index + 1} — ${record.recordId}${
        record.title === null ? "" : ` (${record.title})`
      }`;
      return `${heading}\n${record.text}`;
    })
    .join("\n\n");
  const user = ["Summarize these records:", "", sources].join("\n");
  return { system: summarySystemPrompt, user };
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
