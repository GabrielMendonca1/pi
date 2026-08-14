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
- Gemini remains in the upstream general model catalog and is not added to workflow model configuration.

## Remaining

- Run the final updater to install the exact committed overlay locally.
- Validate active launcher/package/process identity, `.pi` paths, persistent RLM, herdr Pi detection, Gemini selector visibility, and workflow exclusion.
- Push branch and open the PR.
