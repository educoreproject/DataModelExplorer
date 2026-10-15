#!/bin/bash
# raterToolNightlyBackup: nightly copy of the CEDS Rater answer store (TQ, 2026-10-15).
# Uses sqlite3 .backup, which is safe while the API server has the file open.
# One dated file per night, never rotated: the store is tens of KB, so a year is a few MB.
# Installed by COPPER_RIVER; run from the demo user's crontab at 03:15 server time (UTC).

case "$1" in -help|--help|-h)
	cat <<'HELP'
NAME
	raterToolNightlyBackup - copy the CEDS Rater answer store to a dated backup file
SYNOPSIS
	raterToolNightlyBackup
DESCRIPTION
	Reads /home/demo/system/dataStores/raterTool/raterTool.sqlite3 and writes
	/home/demo/system/dataStores/raterTool/backups/raterTool-YYYYMMDD-HHMMSS.sqlite3 (UTC),
	then runs PRAGMA integrity_check on the copy. Never changes or deletes anything else.
EXIT STATUS
	0 written and verified; 1 refused (no store) or failed (backup or integrity check).
HELP
	exit 0;;
esac

sourceFilePath=/home/demo/system/dataStores/raterTool/raterTool.sqlite3
backupDirPath=/home/demo/system/dataStores/raterTool/backups
backupFilePath="$backupDirPath/raterTool-$(date -u +%Y%m%d-%H%M%S).sqlite3"

if [[ ! -f "$sourceFilePath" ]]; then
	echo "raterToolNightlyBackup: refused: no answer store at $sourceFilePath" >&2
	exit 1
fi

mkdir -p "$backupDirPath" || exit 1

if ! sqlite3 "$sourceFilePath" ".backup '$backupFilePath'"; then
	echo "raterToolNightlyBackup: sqlite3 .backup failed for $backupFilePath" >&2
	exit 1
fi

if [[ "$(sqlite3 "$backupFilePath" 'PRAGMA integrity_check;')" != "ok" ]]; then
	echo "raterToolNightlyBackup: integrity_check failed on $backupFilePath" >&2
	exit 1
fi

echo "raterToolNightlyBackup: wrote $backupFilePath ($(stat -c %s "$backupFilePath") bytes)"
