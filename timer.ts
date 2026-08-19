export const PHASES = ["idle", "work", "short_break", "long_break"] as const;
export type Phase = (typeof PHASES)[number];

export type TimerConfig = {
  workMs: number;
  shortBreakMs: number;
  longBreakMs: number;
  sessionsUntilLongBreak: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
};

export type StoredTimer = {
  phase: Phase;
  running: boolean;
  remainingMs: number;
  endsAt: number | null;
  completedWorkSessions: number;
};

export type TimerSnapshot = StoredTimer &
  TimerConfig & {
    totalMs: number;
    phaseLabel: string;
    nextPhase: Phase;
  };

export type TimerEvent = {
  type: "state" | "alert";
  id?: string;
  title?: string;
  description?: string;
  snapshot: TimerSnapshot;
};

const DEFAULTS = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsUntilLongBreak: 4,
} as const;

export function parsePositiveInt(
  raw: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function configFromSettings(settings: {
  workMinutes: string;
  shortBreakMinutes: string;
  longBreakMinutes: string;
  sessionsUntilLongBreak: string;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
}): TimerConfig {
  return {
    workMs:
      parsePositiveInt(settings.workMinutes, DEFAULTS.workMinutes, 1, 180) *
      60_000,
    shortBreakMs:
      parsePositiveInt(
        settings.shortBreakMinutes,
        DEFAULTS.shortBreakMinutes,
        1,
        60,
      ) * 60_000,
    longBreakMs:
      parsePositiveInt(
        settings.longBreakMinutes,
        DEFAULTS.longBreakMinutes,
        1,
        60,
      ) * 60_000,
    sessionsUntilLongBreak: parsePositiveInt(
      settings.sessionsUntilLongBreak,
      DEFAULTS.sessionsUntilLongBreak,
      1,
      12,
    ),
    autoStartBreaks: settings.autoStartBreaks,
    autoStartWork: settings.autoStartWork,
  };
}

export function durationForPhase(phase: Phase, config: TimerConfig): number {
  switch (phase) {
    case "short_break":
      return config.shortBreakMs;
    case "long_break":
      return config.longBreakMs;
    case "work":
    case "idle":
      return config.workMs;
  }
}

export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "idle":
      return "Ready";
    case "work":
      return "Focus";
    case "short_break":
      return "Short break";
    case "long_break":
      return "Long break";
  }
}

export function nextPhaseAfter(
  phase: Phase,
  completedWorkSessions: number,
  sessionsUntilLongBreak: number,
): Phase {
  if (phase === "work") {
    const completed = completedWorkSessions + 1;
    return completed % sessionsUntilLongBreak === 0
      ? "long_break"
      : "short_break";
  }
  return "work";
}

export function remainingMsAt(state: StoredTimer, now: number): number {
  if (state.running && state.endsAt !== null) {
    return Math.max(0, state.endsAt - now);
  }
  return Math.max(0, state.remainingMs);
}

export function snapshotAt(
  state: StoredTimer,
  config: TimerConfig,
  now: number,
): TimerSnapshot {
  const remainingMs = remainingMsAt(state, now);
  const totalMs = durationForPhase(state.phase, config);
  const nextPhase =
    state.phase === "idle"
      ? "work"
      : nextPhaseAfter(
          state.phase,
          state.completedWorkSessions,
          config.sessionsUntilLongBreak,
        );
  return {
    ...state,
    ...config,
    remainingMs,
    totalMs,
    phaseLabel: phaseLabel(state.phase),
    nextPhase,
  };
}

export function idleState(config: TimerConfig): StoredTimer {
  return {
    phase: "idle",
    running: false,
    remainingMs: config.workMs,
    endsAt: null,
    completedWorkSessions: 0,
  };
}

export function startPhase(
  phase: Phase,
  config: TimerConfig,
  completedWorkSessions: number,
  now: number,
  running: boolean,
): StoredTimer {
  const duration = durationForPhase(phase, config);
  return {
    phase,
    running,
    remainingMs: duration,
    endsAt: running ? now + duration : null,
    completedWorkSessions,
  };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function alertCopy(next: StoredTimer): { title: string; description: string } {
  if (next.phase === "short_break" || next.phase === "long_break") {
    return {
      title: "Time for a break",
      description:
        next.phase === "long_break"
          ? "Focus session done. Take a longer rest."
          : "Focus session done. Step away for a short break.",
    };
  }
  if (next.phase === "work") {
    return {
      title: "Break over",
      description: "Ready for the next focus session.",
    };
  }
  return {
    title: "Pomodoro",
    description: "Timer updated.",
  };
}
