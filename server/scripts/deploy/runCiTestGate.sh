#!/bin/bash
# runCiTestGate.sh: the test gate of .github/workflows/deploy.yml.
#
# Runs server/test/runServerSuite.sh, then fails only on tests that failed AND are not named in
# ciExcludedTestList.txt. That list holds the tests that cannot run on a GitHub runner (they need configs/,
# dataStores/, a graph container or askMilo's config, none of which are in the repository). A new test is
# gated by default; excluding one is a visible line in a pull request.
#
#   bash server/scripts/deploy/runCiTestGate.sh suiteLogDirPath perTestTimeoutSeconds
#
# Each test file runs under `timeout perTestTimeoutSeconds` (GNU coreutils; a test that hangs, e.g. waiting on a
# graph that is not there, is killed and counted as FAIL). This is done by handing runServerSuite.sh a node wrapper
# through SUITE_NODE_BIN_PATH, so the suite runner itself is unchanged.
#
# Exit status: 0 no unexpected failure; 1 at least one test failed that is not excluded; 2 bad arguments or files.
# An excluded test that now passes is reported (so the list can shrink) but does not fail the gate.

main() {
	set -u -o pipefail
	local suiteLogDirPath="${1:-}" perTestTimeoutSeconds="${2:-}"
	if [ -z "$suiteLogDirPath" ]; then
		echo "runCiTestGate: REFUSED: suiteLogDirPath is required" >&2
		return 2
	fi
	if ! [[ "$perTestTimeoutSeconds" =~ ^[1-9][0-9]*$ ]]; then
		echo "runCiTestGate: REFUSED: perTestTimeoutSeconds must be a whole number of seconds (got '$perTestTimeoutSeconds')" >&2
		return 2
	fi
	if ! command -v timeout >/dev/null; then
		echo "runCiTestGate: REFUSED: the timeout command (GNU coreutils) is not installed" >&2
		return 2
	fi
	local codeDirPath
	codeDirPath="$(cd "$(dirname "$0")/../../.." && pwd)" || return 2
	local excludedListFilePath="$codeDirPath/server/scripts/deploy/ciExcludedTestList.txt"
	if [ ! -r "$excludedListFilePath" ]; then
		echo "runCiTestGate: REFUSED: $excludedListFilePath is missing" >&2
		return 2
	fi

	local suiteOutputFilePath="$suiteLogDirPath/suiteSummary.txt"
	mkdir -p "$suiteLogDirPath"
	local realNodeBinPath timedNodeBinPath="$suiteLogDirPath/timedNode.sh"
	realNodeBinPath="$(command -v node)" || {
		echo "runCiTestGate: REFUSED: node is not on PATH" >&2
		return 2
	}
	printf '#!/bin/bash\nexec timeout --kill-after=10 %s %q "$@"\n' "$perTestTimeoutSeconds" "$realNodeBinPath" >"$timedNodeBinPath"
	chmod +x "$timedNodeBinPath"
	SUITE_NODE_BIN_PATH="$timedNodeBinPath" bash "$codeDirPath/server/test/runServerSuite.sh" "$suiteLogDirPath" | tee "$suiteOutputFilePath"

	local excludedTestPathList failedTestPathList passedTestPathList
	excludedTestPathList="$(grep -vE '^(#|$)' "$excludedListFilePath" | awk '{print $1}' | sort -u)"
	failedTestPathList="$(grep -E '^FAIL ' "$suiteOutputFilePath" | awk '{print $2}' | sort -u)"
	passedTestPathList="$(grep -E '^(PASS|SKIPPED) ' "$suiteOutputFilePath" | awk '{print $2}' | sed 's/:$//' | sort -u)"

	local unexpectedFailureList nowPassingExclusionList
	unexpectedFailureList="$(comm -23 <(echo "$failedTestPathList") <(echo "$excludedTestPathList") | grep -v '^$')"
	nowPassingExclusionList="$(comm -12 <(echo "$passedTestPathList") <(echo "$excludedTestPathList") | grep -v '^$')"

	echo
	echo "runCiTestGate: $(echo "$excludedTestPathList" | grep -c .) tests excluded as not runnable on GitHub"
	if [ -n "$nowPassingExclusionList" ]; then
		echo "runCiTestGate: these excluded tests now PASS; consider removing them from ciExcludedTestList.txt:"
		echo "$nowPassingExclusionList" | sed 's/^/  /'
	fi
	if [ -n "$unexpectedFailureList" ]; then
		echo "runCiTestGate: GATE FAILED. These tests failed and are not excluded:"
		echo "$unexpectedFailureList" | sed 's/^/  /'
		return 1
	fi
	echo "runCiTestGate: GATE PASSED"
	return 0
}

main "$@"
exit $?
