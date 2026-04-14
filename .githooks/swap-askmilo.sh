#!/usr/bin/env bash
#
# swap-askmilo.sh — flip server/data-model/lib/ask-milo-multitool between
# symlink-to-qbookSuperTool and real-files-in-repo.
#
# STATES
#   "real files" — a real directory containing committed source files.
#                  This is what Brandon sees after cloning. node_modules
#                  is excluded (gitignored in qbookSuperTool's copy and
#                  at the educore top level).
#   "symlink"    — a symlink to qbookSuperTool's canonical ask-milo-multitool.
#                  Used during dev so edits in qbookSuperTool propagate.
#
# USAGE
#   swap-askmilo.sh materialize  # symlink → real files (for pre-commit)
#   swap-askmilo.sh symlink      # real files → symlink (for post-commit,
#                                #                       post-checkout)
#
# BRANDON SAFETY
#   'symlink' mode does nothing if the canonical target isn't present.
#   A clone without qbookSuperTool keeps the real files untouched.

set -euo pipefail

MODE="${1:-}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKING_PATH="$REPO_ROOT/server/data-model/lib/ask-milo-multitool"

# Canonical source lives in qbookSuperTool. qbookSuperTool is not a
# sibling of educore (it's at ~/tq_usr_bin/), so hardcode via $HOME.
CANONICAL_TARGET="$HOME/tq_usr_bin/qbookSuperTool/system/code/cli/lib.d/ask-milo-multitool"

case "$MODE" in
    materialize)
        if [[ -L "$WORKING_PATH" ]]; then
            TARGET="$(readlink "$WORKING_PATH")"
            if [[ ! -d "$TARGET" ]]; then
                echo "[askmilo-swap] ERROR: symlink target missing: $TARGET" >&2
                echo "[askmilo-swap] aborting commit — resolve manually." >&2
                exit 1
            fi
            rm "$WORKING_PATH"
            # rsync with --exclude=node_modules: askMilo's node_modules is
            # ~120 MB and would slow every commit. Gitignore would skip it
            # anyway, but avoiding the copy entirely is cleaner.
            rsync -a --exclude='node_modules' "$TARGET/" "$WORKING_PATH/"
            git add "$WORKING_PATH"
            echo "[askmilo-swap] materialized symlink → real files (staged)"
        fi
        ;;

    symlink)
        if [[ -d "$WORKING_PATH" && ! -L "$WORKING_PATH" ]]; then
            if [[ -d "$CANONICAL_TARGET" ]]; then
                rm -rf "$WORKING_PATH"
                ln -s "$CANONICAL_TARGET" "$WORKING_PATH"
                echo "[askmilo-swap] restored symlink → $CANONICAL_TARGET"
            fi
            # else: silent no-op — canonical target absent (Brandon case)
        fi
        ;;

    *)
        echo "Usage: $0 {materialize|symlink}" >&2
        exit 1
        ;;
esac
