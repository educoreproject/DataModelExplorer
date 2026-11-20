# server/scripts/deploy

How educore's code reaches its servers (PLAN-gitAutoDeploy-112026).

- A push to `dev` deploys demo.educore.dev. A push to `main` waits for approval in GitHub (environment `prod`), then deploys production.
- `.github/workflows/deploy.yml` builds the front end on GitHub, runs the test gate, and connects to the server with a key that can run only `deployFromGit.sh`.
- `deployFromGit.sh` moves the server's git checkout to the commit, runs `npm ci` where a lock file changed (`npmInstallDirectoryList.txt`), puts the build in place, restarts, smoke tests, and rolls back on failure. `deployFromGit.sh -help` prints the details.
- `runCiTestGate.sh` runs the server suite and fails on any test not named in `ciExcludedTestList.txt` (tests that need configs, data or graphs that GitHub does not have).
- To stop deploys for a while, create the server's hold file (`holdFilePath` in its `configs/deployFromGit.ini`, e.g. `/home/demo/DEPLOY_HOLD`) with a line saying why. Remove it to release.
- Configs and askMilo prompts are not in this repository; they still deploy with `deployPrograms <instance> --actions=configs,prompts`.
