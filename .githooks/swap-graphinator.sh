#!/usr/bin/env bash
#
# swap-graphinator.sh — flip html/layers/graphinator between two states.
#
# STATES
#   "real files" — a real directory containing committed source files.
#                  This is what Brandon (and any fresh clone) sees.
#   "symlink"    — a symlink to qbookInternal's canonical layer.
#                  Used during TQ's development so edits to qbookInternal
#                  propagate immediately.
#
# USAGE
#   swap-graphinator.sh materialize  # symlink → real files (for pre-commit)
#   swap-graphinator.sh symlink      # real files → symlink (for post-commit,
#                                    #                       post-checkout)
#
# BRANDON SAFETY
#   'symlink' mode does nothing if the canonical target (qbookInternal's
#   layer) isn't present. Consumers without qbookInternal keep their real
#   files untouched.

set -euo pipefail

MODE="${1:-}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
LAYER_PATH="$REPO_ROOT/html/layers/graphinator"

# Canonical source lives at ../../../qbookInternal/system/code/html/layers/graphinator
# Relative to REPO_ROOT = .../webdev/educore/system/code
WEBDEV_DIR="$(cd "$REPO_ROOT/../../.." && pwd)"
CANONICAL_TARGET="$WEBDEV_DIR/qbookInternal/system/code/html/layers/graphinator"

case "$MODE" in
    materialize)
        if [[ -L "$LAYER_PATH" ]]; then
            TARGET="$(readlink "$LAYER_PATH")"
            if [[ ! -d "$TARGET" ]]; then
                echo "[graphinator-swap] ERROR: symlink target missing: $TARGET" >&2
                echo "[graphinator-swap] aborting commit — resolve manually." >&2
                exit 1
            fi
            rm "$LAYER_PATH"
            cp -R "$TARGET" "$LAYER_PATH"
            git add "$LAYER_PATH"
            echo "[graphinator-swap] materialized symlink → real files (staged)"
        fi
        ;;

    symlink)
        if [[ -d "$LAYER_PATH" && ! -L "$LAYER_PATH" ]]; then
            if [[ -d "$CANONICAL_TARGET" ]]; then
                rm -rf "$LAYER_PATH"
                ln -s "$CANONICAL_TARGET" "$LAYER_PATH"
                echo "[graphinator-swap] restored symlink → $CANONICAL_TARGET"
            fi
            # else: silent no-op — canonical target absent (e.g., Brandon's machine)
        fi
        ;;

    *)
        echo "Usage: $0 {materialize|symlink}" >&2
        exit 1
        ;;
esac
