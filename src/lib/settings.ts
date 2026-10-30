import { useSyncExternalStore } from "react";
import type { TutorMode } from "./db";

export type Effort = "low" | "medium" | "high";

export interface Settings {
  apiKey: string;
  effort: Effort;
  defaultMode: TutorMode;
}

const KEY = "chem-tutor-settings";
const DEFAULTS: Settings = { apiKey: "", effort: "medium", defaultMode: "coach" };
const listeners = new Set<() => void>();

function read(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

let cached = read();

export function getSettings(): Settings {
  return cached;
}

export function updateSettings(change: Partial<Settings>): void {
  cached = { ...cached, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Storage blocked (private mode); settings last for this visit only.
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSettings,
  );
}
