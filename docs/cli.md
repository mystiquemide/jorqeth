# Jorqeth QA CLI

The CLI is available from the repository root and uses only Node built-ins.

```bash
npm run cli -- --help
```

## Commands

```bash
npm run doctor
npm run config:check
npm run test
npm run health
npm run deploy:check
npm run cli -- flow list
npm run cli -- flow run primary
npm run qa
npm run qa:full
npm run cli -- report
```

`health` checks the default deployment at `https://jorqeth.vercel.app`. Use another deployment or
local server with:

```bash
npm run cli -- health --url http://localhost:3000
npm run cli -- deploy check --url https://jorqeth.vercel.app --timeout 30s
```

## Output and exit codes

Checks use four statuses:

- `PASS`: the check completed and its evidence matched the expected contract.
- `FAIL`: a release-blocking check failed. The command exits with code `1`.
- `WARN`: the check completed with a non-blocking environment or hardening warning.
- `SKIP`: a check could not run because its optional toolchain is unavailable.

Use `--json` for a stable machine-readable report, `--quiet` for a one-line result, and `--verbose`
to include command output in the human report. `--ci` keeps the same non-zero behavior while making
the intended CI use explicit.

## Artifacts

Each executed command writes:

- `artifacts/qa/summary.json`, the versioned structured result.
- `artifacts/qa/summary.md`, a human-readable report.
- `artifacts/qa/junit.xml`, a CI test report.
- `artifacts/qa/*.log`, masked command logs when a command was executed.

The directory is ignored by Git so a local run cannot dirty the repository with generated output.
