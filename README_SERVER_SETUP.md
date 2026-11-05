# Educore Server Setup Guide

Steps required to bring up a new educore server from a fresh Ubuntu 24 droplet. Documented from the RADIANT_MEADOW session (2026-03-25) deploying to educore.tqtmp.org.

## Prerequisites

- Ubuntu 24 droplet, minimum **4GB RAM** (4 Neo4j containers use ~2GB combined)
- SSH access configured (e.g., `ssh educore` via ~/.ssh/config)
- DNS pointing to the droplet IP
- Local educore project at `/Users/tqwhite/Documents/webdev/educore/`

## 1. Install Node.js

```bash
ssh educore 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -'
ssh educore 'apt install nodejs -y'
ssh educore 'node --version'  # v22.x
```

## 2. Install Docker

```bash
ssh educore 'install -m 0755 -d /etc/apt/keyrings && \
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && \
  chmod a+r /etc/apt/keyrings/docker.asc && \
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list && \
  apt-get update -qq'
ssh educore 'apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin'
```

## 3. Install nginx

```bash
ssh educore 'apt install nginx -y'
```

## 3a. Keep Docker ports off the internet (REQUIRED)

**ufw does not protect Docker-published ports.** Docker writes its own iptables rules ahead of ufw's, so a container run with `-p 7720:7687` is reachable from the whole internet even when ufw allows only ssh and nginx. The graph containers publish on `0.0.0.0`; until 2026-11-02 the production, demo and warm-spare Neo4j ports on this box (and six on cfnew) answered from outside. Nothing legitimate needs them from outside: the app, nginx and askMilo reach them over localhost.

The fix lives in Docker's `DOCKER-USER` chain, which Docker consults before its own rules and never overwrites. Replies to traffic the containers started are allowed; new connections arriving on the public interface (`eth0` on these droplets; check with `ip -br addr`) are dropped. The private VPC (`eth1`) and localhost are untouched, and no container has to be recreated.

Apply live:

```bash
ssh educore 'iptables -I DOCKER-USER 1 -i eth0 -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN && iptables -I DOCKER-USER 2 -i eth0 -j DROP'
```

Persist across reboots by appending this block to `/etc/ufw/after.rules` (back the file up first), then check it parses with `ufw --dry-run reload`:

```
# BEGIN milo DOCKER-USER
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -i eth0 -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A DOCKER-USER -i eth0 -j DROP
COMMIT
# END milo DOCKER-USER
```

Verify from OUTSIDE the box (your Mac), not from the server, since localhost always connects:

```bash
for p in 7720 7721 7726 7727; do nc -z -G 4 <droplet-ip> $p && echo "$p OPEN" || echo "$p closed"; done
```

Every graph port must read `closed`, and the sites must still return 200. To undo: `iptables -D DOCKER-USER -i eth0 -j DROP` and remove the block from `after.rules`.

## 4. Add swap (REQUIRED)

This box runs several Neo4j containers, four API instances and whole-block downloads on 7.9 GB of RAM. The original 2 GB of swap is not enough: on 2026-11-04 one 476 MB block download took it from 1,852 MB to full, mostly by pushing idle Neo4j memory out, while `MemAvailable` still looked healthy. A full swap leaves no cushion, and the next spike can get a process killed. **So watch swap used as well as available memory.**

Current setup, 6 GB of swap and `swappiness` 10:

```bash
# the original 2 GB, on the root disk
ssh educore 'fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab'

# 4 GB more, on the block volume (needs /mnt/external_volume_1 mounted). nofail lets the box boot without the volume.
ssh educore 'SF=/mnt/external_volume_1/swapfile4g; fallocate -l 4G $SF && chmod 600 $SF && mkswap $SF && swapon $SF && echo "$SF none swap sw,nofail,x-systemd.requires-mounts-for=/mnt/external_volume_1 0 0" >> /etc/fstab && systemctl daemon-reload'

# prefer dropping file cache to swapping out idle programs
ssh educore 'sysctl -q vm.swappiness=10 && echo "vm.swappiness=10" > /etc/sysctl.d/90-educore-swappiness.conf'
```

Check it with `ssh educore 'free -m; swapon --show; cat /proc/sys/vm/swappiness'`. Neither change needs a restart.

To undo the 4 GB file: `swapoff /mnt/external_volume_1/swapfile4g`, remove its line from `/etc/fstab`, then delete the file. To undo the setting: remove the `sysctl.d` file and run `sysctl -q vm.swappiness=60`.

More swap only buys a cushion. If swap used keeps climbing, the droplet needs more RAM.

## 5. Deploy configs and code

```bash
deployPrograms educore --actions=configs
deployPrograms educore --actions=code
```

Note: `deployPrograms` handles the askMilo symlink and npm install automatically via post-deploy SSH commands configured in `deployPrograms.ini` (`actions.code.ssh.after.1`).

**One askMilo link per instance.** Several instances share one box (production in `/home/educore`, plus `/home/demo`, `/home/tq`, `/home/brandon`), and `/usr/local/bin` is host-wide. Only production writes the plain name; every other instance writes its own:

	/usr/local/bin/askMilo          -> /home/educore/system/code/... (production, educore.tqtmp.org)
	/usr/local/bin/askMilo-demo     -> /home/demo/system/code/...
	/usr/local/bin/askMilo-tq       -> /home/tq/system/code/...
	/usr/local/bin/askMilo-brandon  -> /home/brandon/system/code/...

Until 2026-11-02 every instance wrote `/usr/local/bin/askMilo`, so whichever instance deployed last owned it (a demo deploy silently re-pointed it away from production). The running servers do not depend on the link (ws-graphinator spawns its own repo copy), but anything typed or scripted as bare `askMilo` does. A new instance's `deployPrograms.ini` must use its own `askMilo-<instance>` name.

## 6. Install nginx config

The config file is deployed to `system/configs/systemConfigsLib/nginx/` on the server. Symlink it and restart nginx.

```bash
ssh educore 'ln -sf /home/educore/system/configs/systemConfigsLib/nginx/com.tqwhite.educore.conf /etc/nginx/sites-enabled/com.tqwhite.educore.conf'
ssh educore 'nginx -t && systemctl restart nginx'
```

## 7. Install systemctl service

```bash
ssh educore 'cp /home/educore/system/configs/systemConfigsLib/systemctl/com.tqwhite.educore.service /etc/systemd/system/com.tqwhite.educore.service'
ssh educore 'systemctl daemon-reload && systemctl enable com.tqwhite.educore'
```

## 8. Initialize Neo4j containers

Each graph provider has an indexer CLI that manages its Neo4j container. On first run, the indexer extracts a pre-built database from a tarball, creates a Docker container (`--restart unless-stopped`), and writes an instance config `.ini` to `dataStores/instanceSpecific/`. Once created, Docker keeps containers running across reboots — no startup commands are needed in `provider.json`.

**The instance config `.ini` is the control flag.** If it exists, the indexer treats the container as already initialized and does nothing. If it's missing, the indexer creates the container from scratch.

### First-time initialization

Remove any stale search `.ini` files that may have been deployed from an old server's configs (these cause the containerManager to skip initialization):

```bash
ssh educore 'rm -f /home/educore/system/configs/*Search.ini'
```

Then run the unified DME indexer's `-start` command:

```bash
ssh educore 'cd /home/educore/system/code/cli/lib.d/index-data-model-explorer-for-milo && node indexDataModelExplorer.js -start --assetsDir=./assets'
```

All education data standards (CEDS, SIF, Ed-Fi, PESC, CTDL, SEDM, JEDx, EdMatrix, CIP) are loaded into the single unified DME Neo4j container via graphForge. The per-standard indexers and their containers (CedsOntology14, SifSpecGraph, etc.) have been retired.

### Resetting a container to a fresh distribution database

To rebuild a container from its tarball (e.g., after data corruption or to pick up a new tarball):

1. Stop and remove the container:
   ```bash
   ssh educore 'docker stop rag_ContainerName && docker rm rag_ContainerName'
   ```

2. Remove the instance config `.ini` and data directory:
   ```bash
   ssh educore 'rm -rf /home/educore/system/dataStores/instanceSpecific/index-xxx-for-milo'
   ```

3. Remove the search `.ini`:
   ```bash
   ssh educore 'rm -f /home/educore/system/configs/xxxSearch.ini'
   ```

4. Re-run the indexer's `-start` command (see above).

### Verify containers

```bash
ssh educore 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
```

Expected containers:
| Container | Bolt Port | HTTP Port |
|-----------|-----------|-----------|
| rag_DataModelExplorer | 7706+ | 7707+ |

Ports are dynamically assigned starting from 7700 in pairs.

## 9. Start the educore service

```bash
ssh educore 'systemctl start com.tqwhite.educore'
ssh educore 'systemctl status com.tqwhite.educore'  # should show "Magic happens on 7790"
```

## Gotchas and Lessons Learned

### Docker port-scanning race condition (fixed)

The containerManager uses `net.createServer()` to check if a port is free. When multiple providers start sequentially during askMilo cold-start, `docker run -d` returns before Docker fully binds the port. The next provider's port scan can see the port as free and try to use it, causing a port conflict.

**Fix applied:** `getDockerBoundPorts()` function added to `containerManager.js`. It queries `docker ps --format '{{.Ports}}'` to collect Docker-claimed ports before scanning, preventing the race.

Files changed:
- `cli/lib.d/index-data-model-explorer-for-milo/lib/containerManager.js`

### Neo4j driver encryption mismatch

Neo4j 5 community edition does not support TLS on the bolt connector. Some neo4j-driver versions default to attempting encrypted connections. All `neo4j.driver()` calls must include `{ encrypted: false }`.

Files that needed this fix:
- `cli/lib.d/ceds-ontology14/cedsOntology14Search.js`
- `cli/lib.d/ceds-ontology14/parseRdf.js` (3 instances)

Files that already had it:
- `cli/lib.d/data-model-explorer/dataModelExplorerSearch.js`

### Memory requirements

Each Neo4j container uses 300-700MB. Four containers plus nginx plus the node API server require **minimum 4GB RAM**. A 2GB droplet will OOM and become unreachable. Add 2GB swap as safety margin.

### nginx config semicolon

The `server_name` directive must end with a semicolon. Missing it causes nginx to fail silently or behave unpredictably.

### systemctl service — absolute node path

systemctl does not inherit the shell PATH. Use `/usr/bin/node` instead of `node` in the `ExecStart` directive.
