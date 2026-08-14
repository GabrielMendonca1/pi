#!/usr/bin/env bash
set -euo pipefail

OVERLAY_REPO=${PI_RLM_OVERLAY_REPO:-__OVERLAY_REPO__}
STORE=${PI_RLM_OVERLAY_STORE:-$HOME/.local/share/pi-rlm-overlay}
UPDATER="$OVERLAY_REPO/scripts/pi-rlm-update.mjs"
ACTIVE_PI="$STORE/current/bin/pi"

case "${1:-}" in
  rlm-update)
    shift
    exec node "$UPDATER" "$@"
    ;;
  rlm-rollback)
    shift
    exec node "$UPDATER" --rollback "$@"
    ;;
  update)
    shift
    mode=self
    extension_args=(--extensions)
    for arg in "$@"; do
      case "$arg" in
        --all)
          mode=all
          ;;
        self|pi|--self)
          ;;
        --force|--approve|--no-approve)
          extension_args+=("$arg")
          ;;
        --models|--extensions|--extension)
          mode=delegate
          ;;
        -*|*)
          mode=delegate
          ;;
      esac
    done

    if [ "$mode" = delegate ]; then
      exec "$ACTIVE_PI" update "$@"
    fi
    if [ "$mode" = all ]; then
      node "$UPDATER"
      exec "$ACTIVE_PI" update "${extension_args[@]}"
    fi
    exec node "$UPDATER"
    ;;
esac

if [ ! -x "$ACTIVE_PI" ]; then
  echo "pi RLM overlay is not installed; run: node $UPDATER" >&2
  exit 1
fi

exec "$ACTIVE_PI" "$@"
