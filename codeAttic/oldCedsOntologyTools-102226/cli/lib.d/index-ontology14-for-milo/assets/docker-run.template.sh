docker run -d \
  --name <!containerName!> \
  --restart unless-stopped \
  -p <!boltPort!>:7687 \
  -p <!httpPort!>:7474 \
  -e NEO4J_AUTH=neo4j/<!generatedPassword!> \
  -e NEO4J_PLUGINS='["apoc"]' \
  -e NEO4J_dbms_security_procedures_unrestricted=apoc.* \
  -e NEO4J_dbms_security_procedures_allowlist=apoc.* \
  -v <!dataDir!>/data:/data \
  -v <!dataDir!>/logs:/logs \
  -v <!dataDir!>/plugins:/plugins \
  -v <!dataDir!>/import:/var/lib/neo4j/import \
  neo4j:5.26
