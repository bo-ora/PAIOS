import { isAbsolute, join, resolve } from "node:path";

export const knowledgeDataRootEnvironment = "PAIOS_DATA_ROOT";

export interface KnowledgeConfigurationInput {
  repositoryRoot: string;
  commandDataRoot?: string;
  environmentDataRoot?: string;
}

function resolveConfiguredPath(repositoryRoot: string, value: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(repositoryRoot, value);
}

export function resolveKnowledgeDataRoot(
  input: KnowledgeConfigurationInput,
): string {
  if (input.commandDataRoot !== undefined) {
    return resolveConfiguredPath(input.repositoryRoot, input.commandDataRoot);
  }
  if (input.environmentDataRoot !== undefined) {
    return resolveConfiguredPath(input.repositoryRoot, input.environmentDataRoot);
  }
  return join(input.repositoryRoot, ".local", "paios", "knowledge");
}
