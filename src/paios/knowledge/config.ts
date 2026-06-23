import { spawnSync } from "node:child_process";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { existsSync, realpathSync } from "node:fs";

export const knowledgeDataRootEnvironment = "PAIOS_DATA_ROOT";
export const ffmpegPathEnvironment = "PAIOS_FFMPEG_PATH";
export const whisperCliPathEnvironment = "PAIOS_WHISPER_CLI_PATH";
export const whisperModelPathEnvironment = "PAIOS_WHISPER_MODEL_PATH";

export class KnowledgeConfigurationError extends Error {}

function canonicalConfiguredPath(path: string): string {
  const resolved = resolve(path);
  if (existsSync(resolved)) {
    return realpathSync(resolved);
  }
  const parent = dirname(resolved);
  if (parent === resolved) {
    return resolved;
  }
  return join(
    canonicalConfiguredPath(parent),
    resolved.slice(parent.length + 1),
  );
}

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

export function assertPrivateRepositoryPath(
  repositoryRoot: string,
  path: string,
  description: string,
): void {
  const root = canonicalConfiguredPath(repositoryRoot);
  const configuredTarget = isAbsolute(path) ? path : resolve(root, path);
  const target = canonicalConfiguredPath(configuredTarget);
  const repositoryRelative = relative(root, target);
  if (
    repositoryRelative === ".." ||
    repositoryRelative.startsWith(`..${sep}`)
  ) {
    return;
  }
  const worktree = spawnSync(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    { cwd: root, encoding: "utf8" },
  );
  if (worktree.status !== 0 || worktree.stdout.trim() !== "true") {
    return;
  }
  if (repositoryRelative.length === 0) {
    throw new KnowledgeConfigurationError(
      `${description} must not be the repository root.`,
    );
  }
  const ignored = spawnSync(
    "git",
    ["check-ignore", "--quiet", "--", repositoryRelative],
    { cwd: root, encoding: "utf8" },
  );
  if (ignored.status !== 0) {
    throw new KnowledgeConfigurationError(
      `${description} inside the repository must be ignored by Git.`,
    );
  }
}

export interface AudioToolConfiguration {
  ffmpeg: {
    command: string;
    source: "configured" | "path";
  };
  whisperCli: {
    command: string;
    source: "configured" | "path";
  };
  whisperModelPath: string | null;
}

export function resolveAudioToolConfiguration(
  repositoryRoot: string,
  environment: Readonly<Record<string, string | undefined>>,
): AudioToolConfiguration {
  const configuredFfmpeg = environment[ffmpegPathEnvironment]?.trim();
  const configuredWhisperCli =
    environment[whisperCliPathEnvironment]?.trim();
  const configuredModel = environment[whisperModelPathEnvironment]?.trim();

  return {
    ffmpeg:
      configuredFfmpeg === undefined || configuredFfmpeg.length === 0
        ? { command: "ffmpeg", source: "path" }
        : {
            command: resolveConfiguredPath(repositoryRoot, configuredFfmpeg),
            source: "configured",
          },
    whisperCli:
      configuredWhisperCli === undefined || configuredWhisperCli.length === 0
        ? { command: "whisper-cli", source: "path" }
        : {
            command: resolveConfiguredPath(
              repositoryRoot,
              configuredWhisperCli,
            ),
            source: "configured",
          },
    whisperModelPath:
      configuredModel === undefined || configuredModel.length === 0
        ? null
        : resolveConfiguredPath(repositoryRoot, configuredModel),
  };
}
