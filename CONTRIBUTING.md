# Contributing

Install Node 22+, clone this repository, and run `npm install`.

```bash
npx tsc --noEmit
bb plugin install .
bb plugin reload pomodoro
```

Keep secrets and local paths out of commits. Do not add `dist/` — the frontend bundle can embed the builder's working directory.

Open an issue or pull request against `main`. By contributing, you agree that your contributions are licensed under Apache License 2.0.
