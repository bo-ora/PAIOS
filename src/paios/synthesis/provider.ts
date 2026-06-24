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

/** A prior dialogue turn passed to assist mode for phrasing/reference only. */
export interface ConverseTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ConverseRequest {
  message: string;
  context: ConverseTurn[];
}

export interface ConverseResult {
  reply: string;
}

export interface AnswerSynthesisProvider {
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
  /**
   * Generative summary over the user's own selected records (ADR-0008, Phase
   * 3 B). Distinct from grounded Q&A: it transforms the given content and must
   * not add facts not present in it.
   */
  summarize(request: SummarizeRequest): Promise<SummarizeResult>;
  /**
   * Open assist-mode conversation (ADR-0007). May reason and draft using
   * general knowledge but must NOT assert personal facts about the user; those
   * are routed through grounded retrieval by the caller.
   */
  converse(request: ConverseRequest): Promise<ConverseResult>;
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
  // Regression guard: the model used to deflect ("I cannot access the content
  // of your voice notes") when the question named a voice note or file. As with
  // the summarize prompt, enumerating those trigger words primes the very
  // refusal — so frame the sources neutrally: the text below already IS the
  // complete content of whatever the user is asking about.
  "Each source's text below is already the complete, readable content of one of the user's notes. Treat it as the full content of whatever the user is asking about, however they phrase it, and answer directly from this text.",
  "Answer the user's question directly using ONLY those sources, including any personal details they recorded (names, numbers, dates) — it is their own information, so do not refuse or withhold it.",
  "Cite every claim inline with the source's record id in square brackets, e.g. [<record-id>].",
  "Do not use any knowledge that is not in the sources.",
  "If the sources do not contain the answer, say plainly that you cannot find it in their stored knowledge — do not guess or invent details.",
].join(" ");

// A note's stored text is identical whether it was captured by voice or typed,
// so capture-modality words ("voice note", "audio", "recording") carry no
// meaning for a text-grounded answer — but they make llama3.1:8b reflexively
// refuse ("I cannot access or play audio files"). Strip them from the question
// shown to the model. Retrieval still uses the original, un-neutralized question.
export function neutralizeCaptureModality(question: string): string {
  return question
    .replace(
      /\b(?:voice|audio)[\s-]*(notes?|messages?|recordings?|memos?|files?|transcripts?)\b/gi,
      (_match, noun: string) => noun,
    )
    .replace(/\brecordings?\b/gi, (match) => (match.endsWith("s") ? "notes" : "note"))
    .replace(/\baudio\b/gi, "note");
}

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
    `Question: ${neutralizeCaptureModality(request.question)}`,
    "",
    "Sources:",
    sources,
  ].join("\n");
  return { system: synthesisSystemPrompt, user };
}

// Framing note: llama3.1:8b applies a generic "this looks like personal data"
// safety refusal when the prompt foregrounds words like personal/private/
// sensitive — even on the user's OWN notes. So this prompt frames the task as
// a neutral text-condensation job (the text is the user's own saved notes they
// explicitly asked to summarize) and forbids any disclaimer/refusal/commentary,
// while keeping the faithfulness guarantees. Verified live against Ollama.
const summarySystemPrompt = [
  "You are a faithful text summarizer for the user's own saved notes.",
  "The user has explicitly asked you to summarize the text below; it is their own content that they saved themselves.",
  "Write a concise, plain-language summary in the same language as the text.",
  "Use ONLY what the text says — do not add, invent, or infer anything that is not present — and keep concrete details (names, numbers, dates) exactly as written.",
  "Output only the summary itself: no preamble, no disclaimers, no warnings, no refusals, and no commentary about the content.",
  "If the text is short, a single sentence is fine.",
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

const assistSystemPrompt = [
  "You are the user's private personal assistant in open conversation mode.",
  "You may reason, brainstorm, draft, and discuss using general knowledge.",
  "CRITICAL: do not state facts about the user — their data, history, plans, possessions, health, or anything personal — unless those facts were given to you from their stored sources.",
  "If asked something personal you do not have a source for, say you would need to look it up in their notes rather than guessing or inventing it.",
  "Keep replies concise and conversational.",
].join(" ");

export function buildAssistPrompt(request: ConverseRequest): {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
} {
  const history = request.context.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));
  return {
    system: assistSystemPrompt,
    messages: [...history, { role: "user", content: request.message }],
  };
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
