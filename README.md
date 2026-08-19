# Pomodoro for BB

A [BB](https://getbb.app) plugin that runs a configurable Pomodoro timer and reminds you to take a break. The timer lives on the BB server, so it keeps counting when the panel is closed.

## Install

Requires BB 0.39 or later.

```bash
bb plugin install git:https://github.com/matibek/bb-plugin-pomodoro.git@main
```

Then open **Pomodoro** in the BB sidebar, or start a session from the CLI:

```bash
bb pomodoro start
bb pomodoro status
bb pomodoro pause
bb pomodoro skip
bb pomodoro reset
```

## Configuration

Defaults are 25 minutes of focus, a 5-minute short break, a 15-minute long break, and a long break every 4 focus sessions. Breaks auto-start; the next focus session does not.

Change values in **Settings → Plugins → Pomodoro**, or:

```bash
bb plugin config pomodoro
bb plugin config pomodoro set workMinutes 50
bb plugin config pomodoro set shortBreakMinutes 10
bb plugin config pomodoro set longBreakMinutes 20
bb plugin config pomodoro set sessionsUntilLongBreak 4
bb plugin config pomodoro set autoStartBreaks true
bb plugin config pomodoro set autoStartWork false
```

Durations are minutes. New values apply to the next interval.

## Develop

```bash
git clone https://github.com/matibek/bb-plugin-pomodoro.git
cd bb-plugin-pomodoro
npm install
npx tsc --noEmit
bb plugin install .
```

Reload after source changes:

```bash
bb plugin reload pomodoro
```

This plugin is full-trust BB plugin code. Review it before installing from a fork.

## License

Apache License 2.0. See [LICENSE](LICENSE).
