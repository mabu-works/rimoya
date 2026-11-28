# Contributing

This project follows a unified development workflow shared across the
maintainer's repositories (adopted from aegis-app/aegis-bot).

## Development workflow

1. **Open an issue first.** Every change starts with an issue (use the
   issue templates). Describe the purpose, the planned work, and the
   definition of done.
2. **Create a branch from `main`** named `<type>/<issue-number>-<slug>`,
   e.g. `feat/12-test-command`, `fix/9-summary-resend`, `docs/3-readme`.
3. **Implement and test.** Run the checks below locally; all must pass.
4. **Open a pull request.** Fill in the PR template and link the issue
   with `Closes #<number>`.
5. **Merge with "Rebase and merge"** to keep the history of `main`
   linear, then delete the branch.

## Checks for this repository

- Web (unit tests for the shared protocol core):
  `node --test tests/` (Node 22, no dependencies to install)
- Windows input agent (build):
  `agent/build.bat` on Windows, or `agent/build.sh` on the maintainer's
  Linux VM. The built `RimoyaAgent.exe` lands in `agent/dist/` and is
  never committed.

## Commit messages

Commit messages use **Conventional Commits with English subjects**:

```
feat: add master data counts display
fix: persist the posted date to stop re-sending after restarts
docs: update documentation for v1.1.1
```

Types in use: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`.

## Releases

Releases are cut from `main`: bump the version, tag `vX.Y.Z`, and publish
a GitHub Release with notes only (no binaries are attached). In
particular, `RimoyaAgent.exe` is built locally by the maintainer and is
not attached to releases.

## Notes

- Never commit secrets. This project has no server-side secrets; the
  share code and passcode exist only in the host page's memory while
  sharing.
- Do not weaken the security model: passcode authentication happens
  before any video or input, only one viewer connection is accepted at
  a time, and sharing always starts attended (no unattended access).
