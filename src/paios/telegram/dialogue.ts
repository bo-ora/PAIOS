/**
 * Ephemeral per-workspace dialogue and mode state (ADR-0007, ADR-0008).
 *
 * This is conversation state, NOT knowledge: it lives only in memory, is TTL'd
 * by turn age, and is never written to the durable store, disk, or Git. It is
 * lost on restart by design. There are deliberately no persistence APIs here.
 */

export type Mode = "grounded" | "assist";

export interface Turn {
  role: "user" | "assistant";
  text: string;
  /** Epoch milliseconds when the turn occurred. */
  at: number;
}

export interface DialogueStore {
  getMode(key: string): Mode;
  setMode(key: string, mode: Mode): void;
  recentTurns(key: string, now?: number): Turn[];
  appendTurn(key: string, turn: Turn): void;
  lastRecordId(key: string): string | undefined;
  setLastRecordId(key: string, id: string): void;
}

interface DialogueState {
  mode: Mode;
  turns: Turn[];
  lastRecordId?: string;
}

export interface DialogueStoreOptions {
  /** How long a turn stays in context. Default 30 minutes. */
  ttlMs?: number;
  /** Maximum retained turns per workspace. Default 8. */
  maxTurns?: number;
  now?: () => number;
}

const defaultTtlMs = 30 * 60_000;
const defaultMaxTurns = 8;

export function createDialogueStore(
  options: DialogueStoreOptions = {},
): DialogueStore {
  const ttlMs = options.ttlMs ?? defaultTtlMs;
  const maxTurns = options.maxTurns ?? defaultMaxTurns;
  const clock = options.now ?? (() => Date.now());
  const states = new Map<string, DialogueState>();

  function stateFor(key: string): DialogueState {
    let state = states.get(key);
    if (state === undefined) {
      state = { mode: "grounded", turns: [] };
      states.set(key, state);
    }
    return state;
  }

  return {
    getMode(key) {
      return stateFor(key).mode;
    },
    setMode(key, mode) {
      stateFor(key).mode = mode;
    },
    recentTurns(key, now) {
      const cutoff = (now ?? clock()) - ttlMs;
      return stateFor(key).turns.filter((turn) => turn.at >= cutoff);
    },
    appendTurn(key, turn) {
      const state = stateFor(key);
      state.turns.push(turn);
      if (state.turns.length > maxTurns) {
        state.turns.splice(0, state.turns.length - maxTurns);
      }
    },
    lastRecordId(key) {
      return stateFor(key).lastRecordId;
    },
    setLastRecordId(key, id) {
      stateFor(key).lastRecordId = id;
    },
  };
}
