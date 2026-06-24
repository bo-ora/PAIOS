import type { KnowledgeSourceType } from "../types.js";
import { getRecord, listRecords, searchRecords } from "../knowledge/records.js";
import {
  toSearchQuery,
  type AnswerSynthesisProvider,
  type RetrievedRecord,
  type SynthesisOutcome,
} from "../synthesis/provider.js";

/**
 * Source-backed ask orchestration (ADR-0006): retrieve with Phase 1 lexical
 * search, synthesise only from the retrieved local records, and always surface
 * the underlying sources so traceability does not depend on the model's text.
 */

export interface Citation {
  recordId: string;
  sourceReference: string;
  title: string | null;
}

export interface AskResult {
  outcome: SynthesisOutcome;
  answer: string;
  citations: Citation[];
}

export const maxAskSources = 5;

export async function answerQuestion(
  dataRoot: string,
  question: string,
  provider: AnswerSynthesisProvider,
): Promise<AskResult> {
  const query = toSearchQuery(question);
  if (query.length === 0) {
    return { outcome: "no-sources", answer: "", citations: [] };
  }

  let hits;
  try {
    hits = searchRecords(dataRoot, query);
  } catch {
    // An unparseable query yields no usable sources rather than an error.
    return { outcome: "no-sources", answer: "", citations: [] };
  }
  if (hits.length === 0) {
    return { outcome: "no-sources", answer: "", citations: [] };
  }

  const retrieved: RetrievedRecord[] = [];
  for (const hit of hits.slice(0, maxAskSources)) {
    const record = getRecord(dataRoot, hit.recordId);
    if (record !== null) {
      retrieved.push({
        recordId: record.id,
        title: record.title,
        sourceReference: record.sourceReference,
        text: record.normalizedText,
      });
    }
  }
  if (retrieved.length === 0) {
    return { outcome: "no-sources", answer: "", citations: [] };
  }

  const result = await provider.synthesize({ question, records: retrieved });
  const citedIds =
    result.citedRecordIds.length > 0
      ? result.citedRecordIds
      : retrieved.map((record) => record.recordId);
  const citations: Citation[] = retrieved
    .filter((record) => citedIds.includes(record.recordId))
    .map((record) => ({
      recordId: record.recordId,
      sourceReference: record.sourceReference,
      title: record.title,
    }));

  return { outcome: result.outcome, answer: result.answer, citations };
}

export type SummarizeSelector =
  | { recordId: string }
  | { recent: { sourceTypes?: KnowledgeSourceType[]; limit?: number } };

export interface SummarizeOutcome {
  outcome: "summarized" | "no-records";
  summary: string;
  recordIds: string[];
}

export const maxSummarizeSources = 5;

function toRetrieved(
  dataRoot: string,
  recordId: string,
): RetrievedRecord | null {
  const record = getRecord(dataRoot, recordId);
  if (record === null || record.state !== "ready") {
    return null;
  }
  return {
    recordId: record.id,
    title: record.title,
    sourceReference: record.sourceReference,
    text: record.normalizedText,
  };
}

/**
 * Summarize selected records (ADR-0008, Phase 3 B): a specific record by id, or
 * a recent set by type. Returns no-records when the selection is empty rather
 * than calling the model. Nothing is persisted.
 */
export async function summarizeRecords(
  dataRoot: string,
  selector: SummarizeSelector,
  provider: AnswerSynthesisProvider,
): Promise<SummarizeOutcome> {
  const records: RetrievedRecord[] = [];
  if ("recordId" in selector) {
    const retrieved = toRetrieved(dataRoot, selector.recordId);
    if (retrieved !== null) {
      records.push(retrieved);
    }
  } else {
    const items = listRecords(dataRoot, {
      ...(selector.recent.sourceTypes === undefined
        ? {}
        : { sourceTypes: selector.recent.sourceTypes }),
      limit: selector.recent.limit ?? maxSummarizeSources,
    });
    for (const item of items.slice(0, maxSummarizeSources)) {
      const retrieved = toRetrieved(dataRoot, item.id);
      if (retrieved !== null) {
        records.push(retrieved);
      }
    }
  }
  if (records.length === 0) {
    return { outcome: "no-records", summary: "", recordIds: [] };
  }
  const result = await provider.summarize({ records });
  return {
    outcome: "summarized",
    summary: result.summary,
    recordIds: result.recordIds,
  };
}

export function formatAnswerReply(result: AskResult): string {
  if (result.outcome === "no-sources") {
    return "I couldn't find anything in your knowledge base about that.";
  }
  if (result.outcome === "refused" || result.answer.trim().length === 0) {
    return "I couldn't answer that from your stored knowledge.";
  }
  const sources = result.citations
    .map(
      (citation) =>
        `- ${citation.recordId}${
          citation.title === null ? "" : ` — ${citation.title}`
        }`,
    )
    .join("\n");
  return sources.length === 0
    ? result.answer
    : `${result.answer}\n\nSources:\n${sources}`;
}
