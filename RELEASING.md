# Releasing educore

How code gets from a branch to demo and to production. In force since 2026-11-20.

## The rule

All code goes on a branch and reaches `dev` by pull request. A merge into `dev` deploys demo by itself. Production gets `main`, and `main` changes only through a release pull request from `dev`. A merge into `main` deploys production at once; there is no approval step (removed by tqii, 2026-11-21).

| Branch | Deploys to | Server user | Folder |
|:---|:---|:---|:---|
| `dev` | demo.educore.dev | `demo` | `/home/demo/system` |
| `main` | ed-core.org, educore.dev | `prod` | `/home/prod/system` (`/home/educore` links to it) |

Both branches are protected. Nobody can push to them directly, force-push them or delete them. No review approval is needed to merge into `dev`.

## Everyday work

1. Branch from `dev`.
2. Open a pull request into `dev`. GitHub builds and tests it, and the result shows on the pull request.
3. Merge it. Demo deploys in a few minutes.
4. Check it on demo.

## A release to production

1. Open a pull request from `dev` into `main`.
2. Merge it with a **merge commit**. Never squash or rebase a release: that gives `main` different commits from `dev`, and every later release conflicts with itself.
3. Production deploys and smoke-tests itself. The merge is the deploy, so any hold file goes on the server before it.

## A production emergency

Branch from `main`, open a pull request into `main`, and merge it. Then merge `main` back into `dev` straight away, or the next release quietly undoes the fix.

## What a deploy does

`.github/workflows/deploy.yml` runs three jobs on every push to `dev` or `main`:

| Job | What it does |
|:---|:---|
| build | On a GitHub machine: `npm ci` and `nuxt generate` in `html/`. Nothing is built on the droplet. |
| test | The server test suite (`server/scripts/deploy/runCiTestGate.sh`), with a secret-free stand-in config (`server/test/ciConfig/`). A failing test stops the deploy. Tests that need a graph, real data or real keys are listed with their reasons in `server/scripts/deploy/ciExcludedTestList.txt`. A new test is included automatically. |
| deploy | Copies the built site to the server and runs `server/scripts/deploy/deployFromGit.sh` there. For `main` it uses GitHub environment `prod`. |

`deployFromGit.sh`, on the server, in order:

1. Refuses if the hold file exists (see below).
2. Moves the server's git checkout to the merged commit. The checkout is on a fixed commit, not a branch, so `git status` there says "detached HEAD". That is expected.
3. Runs `npm ci` wherever a package lock changed (`server/scripts/deploy/npmInstallDirectoryList.txt`).
4. Puts the new build in place.
5. Restarts the service.
6. Smoke-tests it: ping, health, and the page nginx serves.
7. If the smoke test fails: puts back the previous commit, restarts, and fails the GitHub job.

`deployFromGit.sh -help` gives the details. Every run's log is on the repository's Actions tab.

## What still deploys by hand

Configs and askMilo prompts are not in this repository, because the configs hold real secrets. They still go out from tqii's Mac with deployPrograms:

	deployPrograms demo --actions=configs,prompts
	deployPrograms educore --actions=configs,prompts

deployPrograms' `code` action is switched off for demo and production. The brandon and tq instances still deploy entirely with deployPrograms.

## Pausing deploys

When a merge needs a step done by hand before the new code starts (a database repair, for example), create the server's hold file first, with one line saying why:

	/home/demo/DEPLOY_HOLD - demo
	/home/prod/DEPLOY_HOLD - production

While it exists, deploys to that server refuse and say why. Do the hand step, delete the file, and re-run the deploy from the Actions tab.

## On the server

	com.tqwhite.educore - production's service, runs as prod
	com.tqwhite.educore_demo - demo's service, runs as demo

GitHub logs in with a key that can run `deployFromGit.sh` and nothing else. Each user can restart its own service and nothing else. The server reads this repository anonymously over HTTPS. If the repository ever becomes private, that needs a token or a deploy key.

## GitHub environments

	demo - deploy jobs for dev
	prod - deploy jobs for main only; no required reviewer

Vercel's own environments (`Production`, `Preview` and the rest) are separate. GitHub environment names ignore case, so never name a new one `production`.

## Proven by drill

On 2026-11-20 each of these was set off on purpose and behaved as described:

1. Pushing straight to `dev` or `main` is refused, even for an admin.
2. The GitHub key runs `deployFromGit.sh` and nothing else: other commands, a terminal, port forwarding, scp and sftp are all refused. demo and prod can each restart only their own service.
3. A deploy is refused while another holds the lock.
4. A changed package lock makes the deploy run `npm ci` in that folder.
5. Production refuses a deploy while its hold file exists, and deploys once it is gone.
6. After a droplet reboot, the volume, Docker, nginx, every service and the two live graph containers come back by themselves, and each app reconnects to its graph with no restart.

Rollback is proven on demo only. Production uses the same script, and each step a rollback takes (the git reset and the restart) has already run there as `prod`.

## After a restart

A restarted app takes a while to be fully ready, and `/api/health` shows only part of it. After the 2026-11-20 reboot:

1. The service answers within seconds, with `graphState: waiting`.
2. It reports `graphState: connected` about 40 seconds later, once Neo4j in the graph container has started.
3. About 50 seconds after that, it finishes checking its URIs. Until then every standards query, including over MCP, is refused with `uriPromiseUnavailable`.

Wait for the line `URI promise proved` in the service's journal before judging the MCP tools.

## More detail

| Document | What it holds |
|:---|:---|
| `server/scripts/deploy/README.md` | the deploy files, briefly |
| `system/management/zNotesPlansDocs/PLAN-gitAutoDeploy-112026.md` | the plan, and why it was built this way |
| `system/management/zNotesPlansDocs/gitAutoDeploy-112026/DEVLOG-gitAutoDeploy.md` | the build log and its traps |
