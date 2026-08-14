# Status — official Pi + RLM overlay

Updated: 2026-08-14

## Goal

Run genuine upstream Pi for every release while preserving RLM as a local, versioned, compatibility-checked overlay. Prime Agent must never be the active runtime or update target.

## Complete

- RLM ported onto official Pi `e429d90b80` with persistent IPython, recursive host bridge, isolated Python bootstrap, Pi paths/branding, and extension-tool preservation.
- Core overlay committed as `1ef2653dca`.
- Reproducible patch recorded in `overlay/rlm.patch` with SHA-256 `c8b09609cf3806a2e12b223976c56a0d9c1eaebea1caecc502a36ae21051d864`.
- Updater and stable wrapper implement official-release resolution, identity checks, three-way patching, full validation, atomic activation, dated launcher backup, and current/previous rollback.
- Verified against official `v0.84.2` / `914cf1472e`: repository check, build, Python bootstrap, 4 focused tests, package contents, and CLI smoke test all pass.
- Conflict simulation verified failure-safe behavior; wrapper routing tests cover self, all, extension/model delegation, explicit overlay update, and rollback.
- Installed exact official `v0.84.2` + overlay locally under `~/.local/share/pi-rlm-overlay`; the previous `/opt/homebrew/bin/pi` symlink is preserved in a dated backup.
- Active chain resolves to `@earendil-works/pi-coding-agent@0.84.2`, `dist/cli.js`, and `.pi`; package/runtime scans contain no Prime Agent markers.
- Installed RLM smoke test proved persistent kernel state (`40` → `42`) and a recursive host call; the venv imports `rlm` and `ipykernel` from `~/.pi/agent/kernel-venv`.
- A live PTY process reports `comm=pi` and `args=pi`, satisfying herdr's Pi identity prerequisite. Herdr's default server was offline, so its live `agent explain` endpoint could not be queried.
- Upstream catalogs contain Google Gemini models and workflow configuration contains no Google/Gemini model. Upstream Pi intentionally hides unauthenticated providers from `/model`; no `GEMINI_API_KEY` is configured, so selector visibility remains credential-blocked rather than being faked.
- Branch pushed and PR opened: https://github.com/GabrielMendonca1/pi/pull/2

## Remaining

- Configure a valid Gemini API key with upstream Pi `/login` to make Gemini appear in the general selector.
