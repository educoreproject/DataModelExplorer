#!/bin/bash
# runServerSuite.sh — runs every *.test.js under server/, cli/lib.d/data-model-explorer/test/ and cli/lib.d/rater-tool/test/, one node process each,
# and prints one PASS/FAIL line per file plus the totals. A file passes when node exits 0.
# The multiTenant/ scripts are not *.test.js (they need a running server and live user graphs) and are not included.
#
#   bash server/test/runServerSuite.sh [outputDirPath]
#
# Each file's output is kept in outputDirPath (default: a fresh mktemp directory), named after the file.
CODE_ROOT_PATH="$(cd "$(dirname "$0")/../.." && pwd)"
OUTPUT_DIR_PATH="${1:-$(mktemp -d)}"
mkdir -p "$OUTPUT_DIR_PATH"
# the dev server runs under /usr/local/bin/node (x86_64); code/node_modules/sqlite3 is built for it, so the arm64 node on
# PATH fails every sqlite test with ERR_DLOPEN_FAILED. SUITE_NODE_BIN_PATH overrides.
NODE_BIN_PATH="${SUITE_NODE_BIN_PATH:-/usr/local/bin/node}"
passCount=0
failCount=0
failList=""
cd "$CODE_ROOT_PATH" || exit 2
for testFilePath in $(find server cli/lib.d/data-model-explorer/test cli/lib.d/rater-tool/test -name '*.test.js' -not -path '*/node_modules/*' | sort); do
	logFileName="$(echo "$testFilePath" | tr '/' '_').log"
	if "$NODE_BIN_PATH" "$testFilePath" >"$OUTPUT_DIR_PATH/$logFileName" 2>&1; then
		passCount=$((passCount + 1))
		echo "PASS $testFilePath"
	else
		failCount=$((failCount + 1))
		failList="$failList $testFilePath"
		echo "FAIL $testFilePath"
	fi
done
echo "SUITE TOTAL: $((passCount + failCount)) files, $passCount passed, $failCount failed (logs in $OUTPUT_DIR_PATH)"
for failedFilePath in $failList; do echo "  failed: $failedFilePath"; done
[ "$failCount" -eq 0 ]
