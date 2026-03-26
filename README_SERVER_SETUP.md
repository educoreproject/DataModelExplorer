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

## 4. Add swap (recommended)

With 4 containers, 4GB RAM is tight. Add 2GB swap as safety margin.

```bash
ssh educore 'fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab'
```

## 5. Deploy configs and code

```bash
deployPrograms educore --actions=configs
deployPrograms educore --actions=code
```

Note: `deployPrograms` handles the askMilo symlink (`/usr/local/bin/askMilo`) and npm install automatically via post-deploy SSH commands configured in `deployPrograms.ini`.

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

Then run each indexer's `-start` command:

```bash
ssh educore 'cd /home/educore/system/code/cli/lib.d/index-ontology14-for-milo && node indexOntology14ForMilo.js -start --assetsDir=./assets'
ssh educore 'cd /home/educore/system/code/cli/lib.d/index-text-graph-for-milo && node indexTextGraphForMilo.js -start --assetsDir=./assets'
ssh educore 'cd /home/educore/system/code/cli/lib.d/index-data-model-explorer-for-milo && node indexDataModelExplorer.js -start --assetsDir=./assets'
```

SifSpecGraph is initialized via its manager from its own provider directory:

```bash
ssh educore 'cd /home/educore/system/code/cli/lib.d/sif-spec-graph && node sifSpecGraphManager.js -start --assetsDir=./assets'
```

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
| rag_CedsOntology14 | 7700 | 7701 |
| rag_SifSpecGraph | 7702 | 7703 |
| rag_CareerStoryGraph | 7704+ | 7705+ |
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

**Fix applied:** `getDockerBoundPorts()` function added to all three `containerManager.js` files. It queries `docker ps --format '{{.Ports}}'` to collect Docker-claimed ports before scanning, preventing the race.

Files changed:
- `cli/lib.d/index-ontology14-for-milo/lib/containerManager.js`
- `cli/lib.d/index-text-graph-for-milo/lib/containerManager.js`
- `cli/lib.d/index-data-model-explorer-for-milo/lib/containerManager.js`

### Neo4j driver encryption mismatch

Neo4j 5 community edition does not support TLS on the bolt connector. Some neo4j-driver versions default to attempting encrypted connections. All `neo4j.driver()` calls must include `{ encrypted: false }`.

Files that needed this fix:
- `cli/lib.d/ceds-ontology14/cedsOntology14Search.js`
- `cli/lib.d/ceds-ontology14/parseRdf.js` (3 instances)
- `cli/lib.d/career-story-graph-search/careerStoryGraphSearch.js`

Files that already had it:
- `cli/lib.d/data-model-explorer/dataModelExplorerSearch.js`
- `cli/lib.d/sif-spec-graph/sifSpecGraphSearch.js`

### Memory requirements

Each Neo4j container uses 300-700MB. Four containers plus nginx plus the node API server require **minimum 4GB RAM**. A 2GB droplet will OOM and become unreachable. Add 2GB swap as safety margin.

### nginx config semicolon

The `server_name` directive must end with a semicolon. Missing it causes nginx to fail silently or behave unpredictably.

### systemctl service — absolute node path

systemctl does not inherit the shell PATH. Use `/usr/bin/node` instead of `node` in the `ExecStart` directive.
