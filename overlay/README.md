# Official Pi + local RLM overlay

This directory keeps RLM as a versioned patch over the official Pi source. The active runtime is always built from a tagged release of [`earendil-works/pi`](https://github.com/earendil-works/pi); no Prime Agent package, runtime, config directory, or update path is used.

## Guarantees

- `manifest.json` pins the overlay source commit and SHA-256 of `rlm.patch`.
- The updater resolves the latest official npm version to its matching `v<version>` tag, verifies the official package identity (`@earendil-works/pi-coding-agent`, `dist/cli.js`, `.pi`), and applies the overlay with `git apply --3way`.
- Activation happens only after dependency install, model-data hydration, repository checks, build, kernel bootstrap, focused tests, package inspection, installation, and CLI smoke test succeed.
- A patch conflict, checksum mismatch, failed test, or invalid package leaves the active installation unchanged.
- Releases are immutable directories. Activation swaps `current` atomically and preserves `previous` for rollback.

## Commands

From this checkout:

```sh
# Validate the overlay against the latest official release without installing it
node scripts/pi-rlm-update.mjs --check

# Validate, install, and activate it
node scripts/pi-rlm-update.mjs

# After installation, these self-update through the same verified path
pi update
pi update self
pi rlm-update

# Package/model-only updates continue to use upstream Pi
pi update --extensions
pi update --models

# Swap current and previous releases after a bad activation
pi rlm-rollback
```

`pi update --all` first activates verified official Pi + RLM, then asks Pi to update extensions. `pi rlm-update --ref <tag-or-commit>` can validate a specific official ref. `--store <path>` overrides the default store.

## Layout and rollback

The default store is `~/.local/share/pi-rlm-overlay`:

- `releases/<version>-<official>-<overlay>/`: immutable npm installation
- `current`: active release symlink
- `previous`: prior release symlink
- `bin/pi-wrapper`: stable launcher
- `launcher-backups/pi.<timestamp>`: launcher that preceded the first overlay activation

The installer replaces only `~/.local/bin/pi`, after creating a dated backup when one already exists. It does not remove or modify Prime Agent, Homebrew packages, `~/.prime`, or existing Pi state under `~/.pi`.

Exact automatic rollback:

```sh
pi rlm-rollback
```

To leave the overlay entirely, move a dated file from `~/.local/share/pi-rlm-overlay/launcher-backups/` back to `~/.local/bin/pi`. Preserve the file type: backups of symlinks remain symlinks.

## RLM runtime

Pi starts one persistent IPython kernel per session and exposes the `ipython` tool. The bundled Python module provides `await rlm(prompt, ...)`, which delegates recursive calls back to Pi while respecting `RLM_DEPTH` and `RLM_MAX_DEPTH`.

The first run creates `~/.pi/agent/kernel-venv` with `uv`, Python 3.11, `ipykernel`, and the bundled `pi-rlm-runtime`. Override with `PI_RLM_KERNEL_VENV` or provide `PI_RLM_KERNEL_PYTHON` when needed. The source package remains immutable during bootstrap.
