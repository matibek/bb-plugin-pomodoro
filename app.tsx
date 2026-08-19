import { useEffect, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useRealtime,
  useRpc,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatClock, type TimerEvent, type TimerSnapshot } from "./timer";

let lastAlertId: string | undefined;

function usePomodoro() {
  const rpc = useRpc<typeof rpcContract>();
  const [snapshot, setSnapshot] = useState<TimerSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void rpc.call("getState").then((result) => {
      if (!cancelled) setSnapshot(result);
    });
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  useRealtime("pomodoro", (payload) => {
    const event = payload as TimerEvent;
    if (!event || typeof event !== "object" || !event.snapshot) return;
    setSnapshot(event.snapshot);
    if (event.type === "alert" && event.id && event.id !== lastAlertId) {
      lastAlertId = event.id;
      toast(event.title ?? "Pomodoro", {
        description: event.description,
      });
      if (typeof Notification !== "undefined") {
        if (Notification.permission === "granted") {
          new Notification(event.title ?? "Pomodoro", {
            body: event.description,
          });
        } else if (Notification.permission === "default") {
          void Notification.requestPermission();
        }
      }
    }
  });

  useEffect(() => {
    if (!snapshot?.running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [snapshot?.running]);

  const remainingMs =
    snapshot?.running && snapshot.endsAt
      ? Math.max(0, snapshot.endsAt - now)
      : (snapshot?.remainingMs ?? 0);

  return {
    snapshot,
    remainingMs,
    start: () => void rpc.call("start").then(setSnapshot),
    pause: () => void rpc.call("pause").then(setSnapshot),
    skip: () => void rpc.call("skip").then(setSnapshot),
    reset: () => void rpc.call("reset").then(setSnapshot),
  };
}

function Ring({
  remainingMs,
  totalMs,
  phase,
}: {
  remainingMs: number;
  totalMs: number;
  phase: TimerSnapshot["phase"];
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = totalMs <= 0 ? 0 : Math.min(1, remainingMs / totalMs);
  const isBreak = phase === "short_break" || phase === "long_break";
  return (
    <svg viewBox="0 0 128 128" className="h-48 w-48">
      <circle
        cx="64"
        cy="64"
        r={radius}
        fill="none"
        className="stroke-muted"
        strokeWidth="8"
      />
      <circle
        cx="64"
        cy="64"
        r={radius}
        fill="none"
        className={isBreak ? "stroke-primary" : "stroke-foreground"}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        transform="rotate(-90 64 64)"
      />
    </svg>
  );
}

function TimerControls({
  running,
  onStart,
  onPause,
  onSkip,
  onReset,
  size = "default",
}: {
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  onSkip: () => void;
  onReset: () => void;
  size?: "default" | "sm";
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {running ? (
        <Button size={size} onClick={onPause}>
          Pause
        </Button>
      ) : (
        <Button size={size} onClick={onStart}>
          Start
        </Button>
      )}
      <Button size={size} variant="outline" onClick={onSkip}>
        Skip
      </Button>
      <Button size={size} variant="ghost" onClick={onReset}>
        Reset
      </Button>
    </div>
  );
}

function TimerPanel() {
  const pomodoro = usePomodoro();
  const snapshot = pomodoro.snapshot;
  if (!snapshot) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading timer…</div>
    );
  }
  const nextLabel =
    snapshot.nextPhase === "work"
      ? "focus"
      : snapshot.nextPhase === "long_break"
        ? "long break"
        : "short break";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-6">
      <div className="relative">
        <Ring
          remainingMs={pomodoro.remainingMs}
          totalMs={snapshot.totalMs}
          phase={snapshot.phase}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {snapshot.phaseLabel}
          </div>
          <div className="font-mono text-4xl tabular-nums">
            {formatClock(pomodoro.remainingMs)}
          </div>
        </div>
      </div>
      <TimerControls
        running={snapshot.running}
        onStart={pomodoro.start}
        onPause={pomodoro.pause}
        onSkip={pomodoro.skip}
        onReset={pomodoro.reset}
      />
      <p className="text-center text-sm text-muted-foreground">
        {snapshot.completedWorkSessions}/{snapshot.sessionsUntilLongBreak} focus
        sessions this cycle. Next: {nextLabel}.
      </p>
    </div>
  );
}

function HomepageTimer() {
  const pomodoro = usePomodoro();
  const navigate = useBbNavigate();
  const snapshot = pomodoro.snapshot;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pomodoro</CardTitle>
        <CardDescription>
          Focus in intervals, then take a break.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">
            {snapshot?.phaseLabel ?? "Timer"}
          </div>
          <div className="font-mono text-2xl tabular-nums">
            {formatClock(pomodoro.remainingMs)}
          </div>
        </div>
        {snapshot ? (
          <TimerControls
            size="sm"
            running={snapshot.running}
            onStart={pomodoro.start}
            onPause={pomodoro.pause}
            onSkip={pomodoro.skip}
            onReset={pomodoro.reset}
          />
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate.toPluginPanel("timer")}
        >
          Open timer
        </Button>
      </CardContent>
    </Card>
  );
}

function SettingsHelp() {
  const settings = useSettings();
  const values = settings.values;
  return (
    <p className="text-sm text-muted-foreground">
      Durations are minutes. After changing a value here, reload the plugin if
      the running timer should pick up a new idle length. Current:{" "}
      {String(values?.workMinutes ?? "25")} /{" "}
      {String(values?.shortBreakMinutes ?? "5")} /{" "}
      {String(values?.longBreakMinutes ?? "15")} minutes, long break every{" "}
      {String(values?.sessionsUntilLongBreak ?? "4")} sessions.
    </p>
  );
}

function ThreadTimerButton({
  isCompactViewport,
}: {
  isCompactViewport: boolean;
}) {
  const pomodoro = usePomodoro();
  const navigate = useBbNavigate();
  const label = pomodoro.snapshot
    ? `${pomodoro.snapshot.phaseLabel} ${formatClock(pomodoro.remainingMs)}`
    : "Pomodoro";
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-7 max-w-28 items-center rounded-md px-2 text-xs tabular-nums text-muted-foreground hover:bg-state-hover hover:text-foreground"
      onClick={() => navigate.toPluginPanel("timer")}
    >
      {isCompactViewport ? formatClock(pomodoro.remainingMs) : label}
    </button>
  );
}

function SidebarClock() {
  const pomodoro = usePomodoro();
  return (
    <span className="font-mono text-xs tabular-nums text-muted-foreground">
      {formatClock(pomodoro.remainingMs)}
    </span>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "timer",
    title: "Pomodoro",
    icon: "Timer",
    path: "timer",
    component: TimerPanel,
    experimental_sidebarAccessory: SidebarClock,
  });
  app.slots.homepageSection({
    id: "timer",
    title: "Pomodoro",
    component: HomepageTimer,
  });
  app.slots.settingsSection({
    id: "help",
    title: "How intervals work",
    description:
      "A focus session is followed by a short break. After the configured number of focus sessions, you get a long break.",
    component: SettingsHelp,
  });
  app.slots.experimental_threadHeaderAction({
    id: "timer",
    title: "Pomodoro",
    component: ThreadTimerButton,
  });
});
