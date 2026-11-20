#!/bin/bash
# installCiConfig.sh: puts the secret-free CI config where the code looks for configs, for the GitHub test job.
#
#   bash server/test/ciConfig/installCiConfig.sh <configsDirPath>
#
# configsDirPath is the checkout's sibling configs/ directory (code/../configs). Copies configs/instanceSpecific/
# from this folder into it, then replaces every __CI_RANDOM__ with its own fresh random string, so every secret-shaped
# setting has a value no one has seen and no run reuses. Refuses to write over an existing configs directory.

main() {
	set -u -o pipefail
	local configsDirPath="${1:-}"
	if [ -z "$configsDirPath" ]; then
		echo "installCiConfig: REFUSED: configsDirPath is required" >&2
		return 2
	fi
	if [ -e "$configsDirPath" ]; then
		echo "installCiConfig: REFUSED: $configsDirPath already exists; this script only creates a fresh one" >&2
		return 2
	fi
	local ciConfigDirPath
	ciConfigDirPath="$(cd "$(dirname "$0")" && pwd)" || return 2
	mkdir -p "$configsDirPath" && cp -R "$ciConfigDirPath/configs/instanceSpecific" "$configsDirPath/" || {
		echo "installCiConfig: FAILED: could not copy into $configsDirPath" >&2
		return 1
	}
	local iniFilePath replacedCount=0
	while IFS= read -r -d '' iniFilePath; do
		perl -i -pe 'BEGIN { open(my $randomSource, "<", "/dev/urandom") or die; $main::randomSource = $randomSource } s/__CI_RANDOM__/my $b; read($main::randomSource, $b, 24); "ci" . unpack("H*", $b)/ge' "$iniFilePath" || return 1
	done < <(find "$configsDirPath" -name '*.ini' -print0)
	if grep -rq '__CI_RANDOM__' "$configsDirPath"; then
		echo "installCiConfig: FAILED: a __CI_RANDOM__ placeholder was left unreplaced" >&2
		return 1
	fi
	replacedCount="$(grep -rhoE 'ci[0-9a-f]{48}' "$configsDirPath" | sort -u | wc -l | tr -d ' ')"
	echo "installCiConfig: $(find "$configsDirPath" -name '*.ini' | wc -l | tr -d ' ') files installed in $configsDirPath, $replacedCount distinct random values"
	return 0
}

main "$@"
exit $?
