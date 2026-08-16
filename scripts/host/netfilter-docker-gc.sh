#!/usr/bin/env bash
# netfilter-docker-gc.sh — garbage-collect stale Docker netfilter rules.
#
# Background (incident 2026-08-16): Docker writes per-network runtime rules
# (raw/nat/filter) that reference bridge interfaces `br-<12hex>`. When a
# compose network is recreated the bridge ID changes, but rules from the old
# generation can survive — in the live kernel and, worse, inside
# /etc/iptables/rules.v4, where a full `iptables-save` snapshot taken while
# Docker was running gets replayed by netfilter-persistent at EVERY boot.
# If a recreated network reuses the same subnet, the resurrected rules
# (`-d <ip>/32 ! -i br-<dead> -j DROP`) blackhole all container traffic.
#
# This script removes every rule referencing a bridge that does not exist,
# from the live ruleset, and strips ALL bridge-referencing lines from the
# persisted snapshot (it is restored before docker starts, so every br-<id>
# line in it is stale by definition). Rules without a br- reference
# (cilium/k3s chains, INPUT hardening, DOCKER-USER) are never touched.
# Docker rebuilds the rules for its current networks itself.
#
# Idempotent; safe to run any time. Install as docker-netfilter-gc.service
# (runs after docker.service) + .timer, see README.md next to this script.
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "ERROR: must run as root (sudo)" >&2
  exit 1
fi
command -v iptables-save >/dev/null || { echo "ERROR: iptables-save not found" >&2; exit 1; }

BRIDGE_RE='br-[0-9a-f]{12}'
removed_live=0
removed_file=0

bridge_exists() { [[ -e /sys/class/net/$1 ]]; }

# Ghost only if every br-<id> referenced on the line is absent (a rule like
# `-i br-A -o br-B` whose current-bridge half still matches is left alone).
line_has_ghost_bridge() {
  local line=$1 br
  for br in $(grep -oE "$BRIDGE_RE" <<<"$line" | sort -u); do
    if bridge_exists "$br"; then return 1; fi
  done
  return 0
}

# --- 1) live ruleset ---------------------------------------------------------
# Walk iptables-save output; delete (-D) each -A rule referencing only dead
# bridges. Bounded retries in case of duplicates.
while IFS=$'\t' read -r table line; do
  chain=$(awk '{print $2}' <<<"$line")
  spec=${line#-A $chain }
  for _ in 1 2 3 4 5; do
    if iptables-save -t "$table" 2>/dev/null | grep -qF -- "-A $chain $spec"; then
      iptables -t "$table" -D "$chain" $spec
      echo "live:  -t $table -D $chain $spec"
      removed_live=$((removed_live + 1))
    else
      break
    fi
  done
done < <(
  iptables-save 2>/dev/null | awk '/^\*/ { table = substr($0, 2) } /^-A / { print table "\t" $0 }' \
    | while IFS=$'\t' read -r t line; do
        if grep -qE "$BRIDGE_RE" <<<"$line" && line_has_ghost_bridge "$line"; then
          printf '%s\t%s\n' "$t" "$line"
        fi
      done
)

# --- 2) persisted snapshot ---------------------------------------------------
RULES_FILE=/etc/iptables/rules.v4
if [[ -f $RULES_FILE ]] && grep -qE "^[^#].*$BRIDGE_RE" "$RULES_FILE"; then
  stamp=$(date +%Y%m%d-%H%M%S)
  cp -p "$RULES_FILE" "$RULES_FILE.bak-gc-$stamp"
  removed_file=$(grep -cE "$BRIDGE_RE" "$RULES_FILE" || true)
  grep -vE "$BRIDGE_RE" "$RULES_FILE" > "$RULES_FILE.tmp"
  mv "$RULES_FILE.tmp" "$RULES_FILE"
  echo "file:  stripped $removed_file bridge-referencing line(s) from $RULES_FILE (backup: .bak-gc-$stamp)"
fi

echo "done: removed $removed_live live rule(s), $removed_file persisted line(s)"
