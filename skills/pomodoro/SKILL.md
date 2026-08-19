---
name: pomodoro
description: Start, pause, skip, reset, or configure the Pomodoro focus timer. Use when the user asks to take a break, start a focus session, or change timer durations.
---

# Pomodoro timer

Control the installed Pomodoro plugin. The timer runs on the bb server, so it keeps counting even when the panel is closed.

## Commands

- `bb pomodoro status` — current phase and remaining time (`--json` for the snapshot)
- `bb pomodoro start` — start a focus session or resume a paused interval
- `bb pomodoro pause` — pause the current interval
- `bb pomodoro skip` — jump to the next work or break interval
- `bb pomodoro reset` — return to idle
- `bb pomodoro config` — print parsed duration settings

## Configuration

Settings live on the plugin:

- `workMinutes` (default 25)
- `shortBreakMinutes` (default 5)
- `longBreakMinutes` (default 15)
- `sessionsUntilLongBreak` (default 4)
- `autoStartBreaks` (default true)
- `autoStartWork` (default false)

```
bb plugin config pomodoro set workMinutes 50
bb plugin config pomodoro set shortBreakMinutes 10
bb plugin config pomodoro set autoStartBreaks false
```

New durations apply to the next interval. Do not start a timer unless the user asked for one.
