# Host netfilter maintenance (stale Docker bridge rules)

## Incident 2026-08-16 — root cause

Symptom: `api-server` crash-looped with `SocketTimeoutException: Connect timed
out` connecting to `mysql:3306`. MySQL healthy, config correct, both containers
on the same network. Root cause chain:

1. **2026-07-26 & 2026-08-05/06**: full `iptables-save` snapshots were taken
   **while Docker containers were running** and written to
   `/etc/iptables/rules.v4` — freezing Docker's per-network runtime rules
   (referencing then-current bridges) into the persistence file.
2. **Every boot**: `netfilter-persistent.service` replayed the snapshot,
   resurrecting per-IP rules for bridges that no longer exist
   (e.g. `-d 172.18.0.4/32 ! -i br-66885a1f7aad -j DROP`).
3. When a compose network was recreated (`docker compose down && up`) it reused
   subnet `172.18.0.0/16` → resurrected rules dropped ALL traffic to that
   subnet → API could not reach MySQL.

Docker's runtime rules are never supposed to be persisted — dockerd rebuilds
them for its current networks at daemon start (verified: a clean
create/remove cycle leaves no residue).

## Permanent fix (terminal design)

| Layer | Where | What |
|---|---|---|
| Repair tool | `netfilter-docker-gc.sh` (this dir) | One-time: deletes live-kernel rules referencing dead bridges + strips bridge lines from `rules.v4`. Not installed anywhere — run by hand when needed. |
| Persistence as code | docker-gitops `vps_oracle/host-firewall/` | Hand-written host rules live in `host-firewall.sh` (git-versioned), applied at boot by `host-firewall.service`. `netfilter-persistent` disabled. |
| Collision immunity | `docker-compose.yml` | Network pinned to `10.221.0.0/24` — outside docker's 172.x default pool, so no stale rule can ever match this stack's subnet again. |
| Source hygiene | docker-gitops docs | The two docs that taught `netfilter-persistent save` now teach the red line instead. |

RED LINE: never run `iptables-save > /etc/iptables/rules.v4` /
`netfilter-persistent save` / `service iptables save` on this host. Host
firewall changes go into `host-firewall.sh` (docker-gitops repo).

## Post-incident verification (after reboot)

```bash
# no ghost rules: every br- in raw PREROUTING exists in ip -br link
sudo nft -a list chain ip raw PREROUTING | grep -oE 'br-[0-9a-f]{12}' | sort -u \
  | while read b; do ip link show "$b" >/dev/null || echo "GHOST: $b"; done

# stack network on the pinned subnet + API healthy
docker network inspect programming-learning-platform_exercise-platform-net \
  --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'    # expect 10.221.0.0/24
docker compose ps api-server                             # Up (healthy)
```
