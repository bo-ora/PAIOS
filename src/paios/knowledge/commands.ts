export type KnowledgeCommand =
  | { name: "doctor" }
  | {
      name: "add-note";
      title?: string;
      text?: string;
      dataRoot?: string;
    }
  | { name: "show"; recordId: string; dataRoot?: string }
  | { name: "add-file"; path: string; dataRoot?: string }
  | { name: "add-audio"; path: string; dataRoot?: string }
  | { name: "index"; path: string; dataRoot?: string }
  | { name: "ingest-inbox"; dataRoot?: string }
  | { name: "search"; query: string; dataRoot?: string }
  | { name: "rebuild"; dataRoot?: string };

export const knowledgeUsage =
  "Usage:\n" +
  "  ./paios knowledge doctor\n" +
  "  ./paios knowledge add-note [--title TITLE] [--text TEXT] [--data-root PATH]\n" +
  "  ./paios knowledge show RECORD_ID [--data-root PATH]\n" +
  "  ./paios knowledge add-file PATH [--data-root PATH]\n" +
  "  ./paios knowledge add-audio PATH [--data-root PATH]\n" +
  "  ./paios knowledge index PATH [--data-root PATH]\n" +
  "  ./paios knowledge ingest-inbox [--data-root PATH]\n" +
  "  ./paios knowledge search QUERY [--data-root PATH]\n" +
  "  ./paios knowledge rebuild [--data-root PATH]\n";

function extractOption(
  args: string[],
  name: string,
): { args: string[]; value?: string } | null {
  const remaining = [...args];
  const index = remaining.indexOf(name);
  if (index === -1) {
    return { args: remaining };
  }
  const value = remaining[index + 1];
  if (value === undefined || value.startsWith("--")) {
    return null;
  }
  remaining.splice(index, 2);
  if (remaining.includes(name)) {
    return null;
  }
  return { args: remaining, value };
}

function withDataRoot(
  args: string[],
): { args: string[]; dataRoot?: string } | null {
  const extracted = extractOption(args, "--data-root");
  if (extracted === null) {
    return null;
  }
  return extracted.value === undefined
    ? { args: extracted.args }
    : { args: extracted.args, dataRoot: extracted.value };
}

export function parseKnowledgeCommand(args: string[]): KnowledgeCommand | null {
  const name = args[0];
  if (name === "doctor") {
    return args.length === 1 ? { name } : null;
  }
  const configured = withDataRoot(args.slice(1));
  if (name === undefined || configured === null) {
    return null;
  }
  const dataRoot =
    configured.dataRoot === undefined ? {} : { dataRoot: configured.dataRoot };

  if (name === "add-note") {
    const title = extractOption(configured.args, "--title");
    if (title === null) {
      return null;
    }
    const text = extractOption(title.args, "--text");
    if (text?.args.length !== 0) {
      return null;
    }
    return {
      name,
      ...dataRoot,
      ...(title.value === undefined ? {} : { title: title.value }),
      ...(text.value === undefined ? {} : { text: text.value }),
    };
  }

  if (name === "ingest-inbox" || name === "rebuild") {
    return configured.args.length === 0 ? { name, ...dataRoot } : null;
  }

  if (
    name === "show" ||
    name === "add-file" ||
    name === "add-audio" ||
    name === "index" ||
    name === "search"
  ) {
    if (configured.args.length !== 1) {
      return null;
    }
    const value = configured.args[0];
    if (value === undefined || value.length === 0) {
      return null;
    }
    if (name === "show") {
      return { name, recordId: value, ...dataRoot };
    }
    if (name === "search") {
      return { name, query: value, ...dataRoot };
    }
    return { name, path: value, ...dataRoot };
  }

  return null;
}
