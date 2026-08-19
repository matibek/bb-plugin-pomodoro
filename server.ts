import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  alertCopy,
  configFromSettings,
  formatClock,
  idleState,
  nextPhaseAfter,
  remainingMsAt,
  snapshotAt,
  startPhase,
  type StoredTimer,
  type TimerConfig,
  type TimerSnapshot,
} from "./timer.js";

const STATE_KEY = "timer-state";

const snapshotSchema = z
  .object({
    phase: z.enum(["idle", "work", "short_break", "long_break"]),
    running: z.boolean(),
    remainingMs: z.number().int().nonnegative(),
    endsAt: z.number().nullable(),
    completedWorkSessions: z.number().int().nonnegative(),
    workMs: z.number().int().positive(),
    shortBreakMs: z.number().int().positive(),
    longBreakMs: z.number().int().positive(),
    sessionsUntilLongBreak: z.number().int().positive(),
    autoStartBreaks: z.boolean(),
    autoStartWork: z.boolean(),
    totalMs: z.number().int().nonnegative(),
    phaseLabel: z.string(),
    nextPhase: z.enum(["idle", "work", "short_break", "long_break"]),
  })
  .strict();

export const rpcContract = defineRpcContract({
  getState: { input: z.null(), output: snapshotSchema },
  start: { input: z.null(), output: snapshotSchema },
  pause: { input: z.null(), output: snapshotSchema },
  skip: { input: z.null(), output: snapshotSchema },
  reset: { input: z.null(), output: snapshotSchema },
});

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

type Mutation = {
  state: StoredTimer;
  changed?: boolean;
  alert?: { title: string; description: string };
};

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    workMinutes: {
      type: "string",
      label: "Focus minutes",
      default: "25",
    },
    shortBreakMinutes: {
      type: "string",
      label: "Short break minutes",
      default: "5",
    },
    longBreakMinutes: {
      type: "string",
      label: "Long break minutes",
      default: "15",
    },
    sessionsUntilLongBreak: {
      type: "string",
      label: "Focus sessions before a long break",
      default: "4",
    },
    autoStartBreaks: {
      type: "boolean",
      label: "Auto-start breaks",
      default: true,
    },
    autoStartWork: {
      type: "boolean",
      label: "Auto-start the next focus session",
      default: false,
    },
  });

  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const loadConfig = async (): Promise<TimerConfig> =>
    configFromSettings(await settings.get());

  const readStored = async (config: TimerConfig): Promise<StoredTimer> => {
    const stored = await bb.storage.kv.get<StoredTimer>(STATE_KEY);
    if (
      stored &&
      (stored.phase === "idle" ||
        stored.phase === "work" ||
        stored.phase === "short_break" ||
        stored.phase === "long_break") &&
      typeof stored.running === "boolean" &&
      typeof stored.remainingMs === "number"
    ) {
      return stored;
    }
    return idleState(config);
  };

  const publish = (
    snapshot: TimerSnapshot,
    alert?: { title: string; description: string },
  ) => {
    bb.realtime.publish("pomodoro", { type: "state", snapshot });
    if (alert) {
      bb.realtime.publish("pomodoro", {
        type: "alert",
        id: `${Date.now()}-${snapshot.phase}`,
        title: alert.title,
        description: alert.description,
        snapshot,
      });
    }
  };

  const completeCurrent = (
    state: StoredTimer,
    config: TimerConfig,
    now: number,
  ): Mutation => {
    const phase = state.phase === "idle" ? "work" : state.phase;
    const nextPhase = nextPhaseAfter(
      phase,
      state.completedWorkSessions,
      config.sessionsUntilLongBreak,
    );
    const completedWorkSessions =
      phase === "work"
        ? state.completedWorkSessions + 1
        : state.completedWorkSessions;
    const autoStart =
      nextPhase === "work" ? config.autoStartWork : config.autoStartBreaks;
    const next = startPhase(
      nextPhase,
      config,
      completedWorkSessions,
      now,
      autoStart,
    );
    return { state: next, changed: true, alert: alertCopy(next) };
  };

  const applyStart = (
    state: StoredTimer,
    config: TimerConfig,
    now: number,
  ): Mutation => {
    if (state.running) return { state, changed: false };
    if (state.phase === "idle") {
      return {
        state: startPhase("work", config, state.completedWorkSessions, now, true),
        changed: true,
      };
    }
    const remaining = remainingMsAt(state, now);
    if (remaining <= 0) return completeCurrent(state, config, now);
    return {
      state: {
        ...state,
        running: true,
        remainingMs: remaining,
        endsAt: now + remaining,
      },
      changed: true,
    };
  };

  const applyPause = (state: StoredTimer, now: number): Mutation => {
    if (!state.running) return { state, changed: false };
    return {
      state: {
        ...state,
        running: false,
        remainingMs: remainingMsAt(state, now),
        endsAt: null,
      },
      changed: true,
    };
  };

  const applySkip = (
    state: StoredTimer,
    config: TimerConfig,
    now: number,
  ): Mutation => {
    if (state.phase === "idle") {
      return {
        state: startPhase("work", config, state.completedWorkSessions, now, true),
        changed: true,
      };
    }
    return completeCurrent(state, config, now);
  };

  const mutate = (
    fn: (state: StoredTimer, config: TimerConfig, now: number) => Mutation,
  ): Promise<TimerSnapshot> =>
    serialize(async () => {
      const config = await loadConfig();
      const now = Date.now();
      const current = await readStored(config);
      const result = fn(current, config, now);
      if (result.changed !== false) {
        await bb.storage.kv.set(STATE_KEY, result.state);
        const snapshot = snapshotAt(result.state, config, Date.now());
        publish(snapshot, result.alert);
        return snapshot;
      }
      return snapshotAt(result.state, config, now);
    });

  const currentSnapshot = () =>
    serialize(async () => {
      const config = await loadConfig();
      return snapshotAt(await readStored(config), config, Date.now());
    });

  const formatStatus = (snapshot: TimerSnapshot, json: boolean) => {
    if (json) return JSON.stringify(snapshot, null, 2);
    const status = snapshot.running
      ? "running"
      : snapshot.phase === "idle"
        ? "idle"
        : "paused";
    return `${snapshot.phaseLabel} · ${formatClock(snapshot.remainingMs)} remaining · ${status}\nSessions this cycle: ${snapshot.completedWorkSessions}/${snapshot.sessionsUntilLongBreak}`;
  };

  bb.rpc.register(rpcContract, {
    getState: () => currentSnapshot(),
    start: () => mutate(applyStart),
    pause: () => mutate((state, _config, now) => applyPause(state, now)),
    skip: () => mutate(applySkip),
    reset: () =>
      mutate((_state, config) => ({
        state: idleState(config),
        changed: true,
      })),
  });

  bb.cli.register({
    name: "pomodoro",
    summary: "Focus timer with configurable work and break intervals",
    commands: [
      {
        name: "status",
        summary: "Show the current phase and remaining time",
        usage: "bb pomodoro status [--json]",
      },
      {
        name: "start",
        summary: "Start or resume the timer",
        usage: "bb pomodoro start",
      },
      {
        name: "pause",
        summary: "Pause the current interval",
        usage: "bb pomodoro pause",
      },
      {
        name: "skip",
        summary: "Skip to the next work or break interval",
        usage: "bb pomodoro skip",
      },
      {
        name: "reset",
        summary: "Reset the timer to idle",
        usage: "bb pomodoro reset",
      },
      {
        name: "config",
        summary: "Print current duration settings",
        usage: "bb pomodoro config",
      },
    ],
    async run(argv) {
      const json = argv.includes("--json");
      const action = argv.find((arg) => arg !== "--json") ?? "status";
      if (action === "status") {
        return {
          exitCode: 0,
          stdout: `${formatStatus(await currentSnapshot(), json)}\n`,
        };
      }
      if (action === "start") {
        return {
          exitCode: 0,
          stdout: `${formatStatus(await mutate(applyStart), json)}\n`,
        };
      }
      if (action === "pause") {
        return {
          exitCode: 0,
          stdout: `${formatStatus(
            await mutate((state, _config, now) => applyPause(state, now)),
            json,
          )}\n`,
        };
      }
      if (action === "skip") {
        return {
          exitCode: 0,
          stdout: `${formatStatus(await mutate(applySkip), json)}\n`,
        };
      }
      if (action === "reset") {
        return {
          exitCode: 0,
          stdout: `${formatStatus(
            await mutate((_state, config) => ({
              state: idleState(config),
              changed: true,
            })),
            json,
          )}\n`,
        };
      }
      if (action === "config") {
        const config = await loadConfig();
        return {
          exitCode: 0,
          stdout: [
            `Focus: ${config.workMs / 60_000} min`,
            `Short break: ${config.shortBreakMs / 60_000} min`,
            `Long break: ${config.longBreakMs / 60_000} min`,
            `Sessions before long break: ${config.sessionsUntilLongBreak}`,
            `Auto-start breaks: ${config.autoStartBreaks}`,
            `Auto-start focus: ${config.autoStartWork}`,
            "Change values with `bb plugin config pomodoro set <key> <value>`.",
            "",
          ].join("\n"),
        };
      }
      return {
        exitCode: 1,
        stderr:
          "Usage: bb pomodoro [status|start|pause|skip|reset|config] [--json]\n",
      };
    },
  });

  settings.onChange(() => {
    void mutate((state, config) => {
      if (state.phase === "idle" && !state.running) {
        return { state: idleState(config), changed: true };
      }
      return { state, changed: false };
    });
  });

  bb.background.service("ticker", {
    async start(signal) {
      while (!signal.aborted) {
        await mutate((state, config, now) => {
          if (!state.running || state.endsAt === null || now < state.endsAt) {
            return { state, changed: false };
          }
          return completeCurrent(state, config, now);
        });
        await sleep(500, signal);
      }
    },
  });

  bb.log.info("pomodoro timer ready");
  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
