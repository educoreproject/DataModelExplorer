#!/bin/bash
# deployFromGit.sh: the one command GitHub's deploy key may run on this server.
#
# It is the forced command on the deploy key's line in the site user's ~/.ssh/authorized_keys:
#
#   command="<codeDirPath>/server/scripts/deploy/deployFromGit.sh --configFilePath=<home>/system/configs/deployFromGit.ini",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA...
#
# The GitHub job connects, and ssh runs this script whatever command the job asked for. The job's request arrives
# in SSH_ORIGINAL_COMMAND and must read exactly:
#
#   deploy <branchName> <commitSha>
#
# with the built front end (a gzipped tar of html/.output/public) on stdin. Anything else is refused by name.
#
# What it does, in order (each step refuses by name on failure):
#   1. refuse if the hold file exists (a merge that needs a person, such as a database repair, is held this way)
#   2. take the deploy lock, so two deploys never overlap
#   3. unpack the uploaded build into the staging directory and check it has an index.html
#   4. fetch the branch and refuse a commit that is not on it
#   5. record the running commit, then git reset --hard to the new one (configs and data live outside code/)
#   6. npm ci in each directory named in npmInstallDirectoryList.txt whose package-lock.json changed
#   7. put the uploaded build in place as html/.output/public, keeping the previous one
#   8. restart the service through the user's one sudo rule
#   9. smoke test: /api/ping answers, /api/health answers, the site's / serves the new index.html, and the
#      service is still the same running process after stabilitySeconds
#  10. on any failure from step 5 on: reset to the recorded commit, put the previous build back, restart, smoke
#      test that, and exit non-zero so the GitHub job fails loudly
#
# Reads: the config file named by --configFilePath (deployBranchName, systemServiceName, siteBaseUrl, codeDirPath,
# stagingDirPath, holdFilePath, logFilePath, stabilitySeconds, pingWaitSeconds). Changes: codeDirPath's working
# tree and node_modules, html/.output/public, stagingDirPath. Never touches configs/, dataStores/ or anything
# outside codeDirPath and stagingDirPath.
#
# Exit status: 0 deployed; 1 deploy failed and was rolled back; 2 refused before anything changed;
# 3 deploy failed AND the rollback failed (the site needs a person).
#
# The checkout's origin is https://github.com/educoreproject/DataModelExplorer.git, read anonymously: the repository
# is public and GitHub deploy keys are disabled for the educoreproject organisation (2026-11-20). If the repository
# ever becomes private, every server's fetch fails until it is given a read-only credential.
#
# The whole body is inside main(), called on the last line, so bash has parsed all of it before step 5
# rewrites this file on disk.

main() {
	set -u -o pipefail

	local configFilePath=''
	local argumentText
	for argumentText in "$@"; do
		case "$argumentText" in
			-help | --help | -h)
				sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
				return 0
				;;
			--configFilePath=*) configFilePath="${argumentText#--configFilePath=}" ;;
			*)
				echo "deployFromGit: REFUSED: unknown argument '$argumentText' (allowed: --configFilePath=PATH, -help)" >&2
				return 2
				;;
		esac
	done

	if [ -z "$configFilePath" ]; then
		echo "deployFromGit: REFUSED: --configFilePath is required (it is given on the forced-command line in authorized_keys)" >&2
		return 2
	fi
	if [ ! -r "$configFilePath" ]; then
		echo "deployFromGit: REFUSED: config file '$configFilePath' is missing or unreadable" >&2
		return 2
	fi

	# ---- configuration (every name required; no defaults) ----
	local deployBranchName systemServiceName siteBaseUrl codeDirPath stagingDirPath holdFilePath logFilePath
	local stabilitySeconds pingWaitSeconds
	deployBranchName="$(configValueOf "$configFilePath" deployBranchName)" || return 2
	systemServiceName="$(configValueOf "$configFilePath" systemServiceName)" || return 2
	siteBaseUrl="$(configValueOf "$configFilePath" siteBaseUrl)" || return 2
	codeDirPath="$(configValueOf "$configFilePath" codeDirPath)" || return 2
	stagingDirPath="$(configValueOf "$configFilePath" stagingDirPath)" || return 2
	holdFilePath="$(configValueOf "$configFilePath" holdFilePath)" || return 2
	logFilePath="$(configValueOf "$configFilePath" logFilePath)" || return 2
	stabilitySeconds="$(configValueOf "$configFilePath" stabilitySeconds)" || return 2
	pingWaitSeconds="$(configValueOf "$configFilePath" pingWaitSeconds)" || return 2

	if ! [[ "$stabilitySeconds" =~ ^[0-9]+$ ]] || ! [[ "$pingWaitSeconds" =~ ^[0-9]+$ ]]; then
		echo "deployFromGit: REFUSED: stabilitySeconds ('$stabilitySeconds') and pingWaitSeconds ('$pingWaitSeconds') must be whole numbers, in $configFilePath" >&2
		return 2
	fi
	if [ ! -d "$codeDirPath/.git" ]; then
		echo "deployFromGit: REFUSED: codeDirPath '$codeDirPath' is not a git checkout" >&2
		return 2
	fi

	mkdir -p "$stagingDirPath" "$(dirname "$logFilePath")" || {
		echo "deployFromGit: REFUSED: cannot create '$stagingDirPath' or the log directory" >&2
		return 2
	}

	# everything from here on is also appended to the log file
	exec > >(tee -a "$logFilePath") 2>&1

	# ---- the request ----
	local requestText="${SSH_ORIGINAL_COMMAND:-}"
	local requestVerb requestBranchName commitSha extraText
	read -r requestVerb requestBranchName commitSha extraText <<<"$requestText"
	logLine "request: '$requestText'"

	if [ "${requestVerb:-}" != 'deploy' ] || [ -n "${extraText:-}" ]; then
		logLine "REFUSED: the request must read 'deploy <branchName> <commitSha>'; got '$requestText'"
		return 2
	fi
	if [ "${requestBranchName:-}" != "$deployBranchName" ]; then
		logLine "REFUSED: this server deploys branch '$deployBranchName', not '${requestBranchName:-}'"
		return 2
	fi
	if ! [[ "${commitSha:-}" =~ ^[0-9a-f]{40}$ ]]; then
		logLine "REFUSED: commitSha must be a full 40-character lowercase hex sha; got '${commitSha:-}'"
		return 2
	fi

	# ---- 1. hold ----
	if [ -e "$holdFilePath" ]; then
		logLine "REFUSED: deploys are held by $holdFilePath. Its text:"
		sed 's/^/    /' "$holdFilePath"
		logLine "Remove that file to release the hold, then re-run the GitHub job."
		return 2
	fi

	# ---- 2. lock ----
	exec 9>"$stagingDirPath/deployFromGit.lock"
	if ! flock -n 9; then
		logLine "REFUSED: another deploy holds $stagingDirPath/deployFromGit.lock"
		return 2
	fi

	# ---- 3. receive the build ----
	local incomingPublicDirPath="$stagingDirPath/incomingPublic"
	rm -rf "$incomingPublicDirPath"
	mkdir -p "$incomingPublicDirPath"
	if ! tar -xzf - -C "$incomingPublicDirPath"; then
		logLine "REFUSED: could not unpack the uploaded build from stdin"
		return 2
	fi
	if [ ! -s "$incomingPublicDirPath/index.html" ]; then
		logLine "REFUSED: the uploaded build has no index.html"
		return 2
	fi
	logLine "build received: $(find "$incomingPublicDirPath" -type f | wc -l) files"

	# ---- 4. fetch and check the commit ----
	if ! git -C "$codeDirPath" fetch --quiet origin "$deployBranchName"; then
		logLine "REFUSED: git fetch of '$deployBranchName' failed"
		return 2
	fi
	if ! git -C "$codeDirPath" merge-base --is-ancestor "$commitSha" "origin/$deployBranchName" 2>/dev/null; then
		logLine "REFUSED: commit $commitSha is not on origin/$deployBranchName"
		return 2
	fi

	# ---- 5. record, then move the code ----
	local previousCommitSha
	previousCommitSha="$(git -C "$codeDirPath" rev-parse HEAD)" || {
		logLine "REFUSED: cannot read the running commit"
		return 2
	}
	logLine "running commit: $previousCommitSha; deploying: $commitSha"

	local publicDirPath="$codeDirPath/html/.output/public"
	local previousPublicDirPath="$stagingDirPath/previousPublic"
	# cleared before anything moves, so a rollback never restores a build older than the running one
	rm -rf "$previousPublicDirPath"

	if ! applyCommit "$commitSha"; then
		rollBack
		return $?
	fi

	# ---- 7. the build ----
	mkdir -p "$(dirname "$publicDirPath")"
	if [ -d "$publicDirPath" ]; then
		mv "$publicDirPath" "$previousPublicDirPath" || {
			logLine "FAILED: could not move the running build aside"
			rollBack
			return $?
		}
	fi
	mv "$incomingPublicDirPath" "$publicDirPath" || {
		logLine "FAILED: could not put the new build in place"
		rollBack
		return $?
	}
	logLine "new build in place"

	# ---- 8 and 9. restart and smoke test ----
	if ! restartService || ! smokeTest; then
		rollBack
		return $?
	fi

	logLine "DEPLOYED $commitSha to $siteBaseUrl (was $previousCommitSha)"
	return 0
}

# ---- helpers (they read main's locals; bash scoping is dynamic) ----

logLine() {
	echo "deployFromGit $(date -u +%Y-%m-%dT%H:%M:%SZ): $*"
}

configValueOf() {
	local configFilePath="$1" settingName="$2" settingText
	settingText="$(grep -E "^${settingName}=" "$configFilePath" | tail -n 1 | cut -d= -f2-)"
	if [ -z "$settingText" ]; then
		echo "deployFromGit: REFUSED: '$settingName' is missing or empty in $configFilePath" >&2
		return 1
	fi
	echo "$settingText"
}

# git reset to a commit, then npm ci where a lock file changed
applyCommit() {
	local targetCommitSha="$1"
	if ! git -C "$codeDirPath" reset --quiet --hard "$targetCommitSha"; then
		logLine "FAILED: git reset --hard $targetCommitSha"
		return 1
	fi
	logLine "code at $(git -C "$codeDirPath" rev-parse --short HEAD)"
	installPackages
}

# 6. npm ci in each listed directory whose package-lock.json differs from the one its node_modules was built from
installPackages() {
	local directoryListFilePath="$codeDirPath/server/scripts/deploy/npmInstallDirectoryList.txt"
	if [ ! -r "$directoryListFilePath" ]; then
		logLine "FAILED: $directoryListFilePath is missing"
		return 1
	fi
	local relativeDirPath packageDirPath lockHashText stampFilePath
	while read -r relativeDirPath; do
		case "$relativeDirPath" in '' | '#'*) continue ;; esac
		packageDirPath="$codeDirPath/$relativeDirPath"
		if [ ! -f "$packageDirPath/package-lock.json" ]; then
			logLine "FAILED: $relativeDirPath/package-lock.json is missing (listed in npmInstallDirectoryList.txt)"
			return 1
		fi
		lockHashText="$(sha256sum "$packageDirPath/package-lock.json" | cut -d' ' -f1)"
		stampFilePath="$packageDirPath/node_modules/.deployFromGitLockHash"
		if [ -f "$stampFilePath" ] && [ "$(cat "$stampFilePath")" = "$lockHashText" ]; then
			continue
		fi
		logLine "npm ci in $relativeDirPath"
		if ! (cd "$packageDirPath" && npm ci --omit=dev --no-audit --no-fund --loglevel=error); then
			logLine "FAILED: npm ci in $relativeDirPath"
			return 1
		fi
		echo "$lockHashText" >"$stampFilePath"
	done <"$directoryListFilePath"
	return 0
}

restartService() {
	logLine "restarting $systemServiceName"
	if ! sudo -n /usr/bin/systemctl restart "$systemServiceName"; then
		logLine "FAILED: sudo systemctl restart $systemServiceName"
		return 1
	fi
	return 0
}

smokeTest() {
	local waitedSeconds=0 pingText=''
	while [ "$waitedSeconds" -lt "$pingWaitSeconds" ]; do
		pingText="$(curl -fsS --max-time 5 "$siteBaseUrl/api/ping" 2>/dev/null)"
		[ "$pingText" = 'hello from ping' ] && break
		sleep 2
		waitedSeconds=$((waitedSeconds + 2))
	done
	if [ "$pingText" != 'hello from ping' ]; then
		logLine "SMOKE FAILED: $siteBaseUrl/api/ping did not answer 'hello from ping' within ${pingWaitSeconds}s (last: '$pingText')"
		return 1
	fi
	logLine "smoke: /api/ping answered after ${waitedSeconds}s"

	local healthText
	healthText="$(curl -fsS --max-time 10 "$siteBaseUrl/api/health" 2>&1)"
	if ! [[ "$healthText" == *'"graphState"'* ]]; then
		logLine "SMOKE FAILED: $siteBaseUrl/api/health did not report a graphState (got '$healthText')"
		return 1
	fi
	logLine "smoke: /api/health $healthText"

	local servedIndexHashText builtIndexHashText
	servedIndexHashText="$(curl -fsS --max-time 10 "$siteBaseUrl/" | sha256sum | cut -d' ' -f1)"
	builtIndexHashText="$(sha256sum "$codeDirPath/html/.output/public/index.html" | cut -d' ' -f1)"
	if [ "$servedIndexHashText" != "$builtIndexHashText" ]; then
		logLine "SMOKE FAILED: $siteBaseUrl/ does not serve the index.html now in html/.output/public"
		return 1
	fi
	logLine "smoke: / serves the deployed index.html"

	local mainProcessId laterProcessId
	mainProcessId="$(systemctl show -p MainPID --value "$systemServiceName")"
	sleep "$stabilitySeconds"
	laterProcessId="$(systemctl show -p MainPID --value "$systemServiceName")"
	if ! systemctl is-active --quiet "$systemServiceName" || [ "$mainProcessId" != "$laterProcessId" ] || [ "$mainProcessId" = '0' ]; then
		logLine "SMOKE FAILED: $systemServiceName did not stay up for ${stabilitySeconds}s (process $mainProcessId, then $laterProcessId)"
		return 1
	fi
	logLine "smoke: $systemServiceName stayed up ${stabilitySeconds}s as process $mainProcessId"
	return 0
}

# 10. put back the recorded commit and build; returns 1 when the site is back, 3 when it is not
rollBack() {
	logLine "ROLLING BACK to $previousCommitSha"
	local rollbackFailed=''
	applyCommit "$previousCommitSha" || rollbackFailed='code'
	if [ -d "$previousPublicDirPath" ]; then
		rm -rf "$publicDirPath"
		mv "$previousPublicDirPath" "$publicDirPath" || rollbackFailed="$rollbackFailed build"
	fi
	restartService || rollbackFailed="$rollbackFailed restart"
	if [ -z "$rollbackFailed" ] && smokeTest; then
		logLine "ROLLED BACK: $siteBaseUrl is running $previousCommitSha again. The deploy of $commitSha FAILED."
		return 1
	fi
	logLine "ROLLBACK FAILED (${rollbackFailed:-smoke test}): $siteBaseUrl needs a person now"
	return 3
}

main "$@"
exit $?
