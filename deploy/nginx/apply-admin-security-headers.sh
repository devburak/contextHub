#!/usr/bin/env bash
# Run as root on the Admin host. Preserve the existing vhost and roll back on failure.
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077

[[ $EUID -eq 0 ]] || { echo 'Run this script from a root session on the Admin server.' >&2; exit 1; }
PAYLOAD_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
VHOST=$(readlink -f /etc/nginx/sites-enabled/ctxhub.net.conf)
SNIPPET=/etc/nginx/snippets/ctxhub-security-headers.conf
[[ -f $VHOST && -f $PAYLOAD_DIR/harden-admin-vhost.py && -f $PAYLOAD_DIR/ctxhub-security-headers.conf ]]

exec 9>/run/lock/ctxhub-admin-security-headers.lock
flock -n 9 || { echo 'Another Admin Nginx update is running.' >&2; exit 1; }
cd "$PAYLOAD_DIR"
echo 'ffb72d2c5d7fce1ca41d44674c20aebcfd16022a986a1af29a7eff1f119f2a9a  harden-admin-vhost.py' | sha256sum --check --status
echo '9a8b5d63d8d1acfb4ff47aa4b2f6a6ea43e90a042a2febfeb1c7648d42eeb6f6  ctxhub-security-headers.conf' | sha256sum --check --status

BACKUP=$(mktemp -d /root/ctxhub-admin-hardening-20261116.XXXXXX)
echo "Nginx rollback records: $BACKUP"
cp -a "$VHOST" "$BACKUP/before-vhost.conf"
if [[ -f $SNIPPET ]]; then cp -a "$SNIPPET" "$BACKUP/before-snippet.conf"; fi
nginx -t > "$BACKUP/before-validation.log" 2>&1
python3 "$PAYLOAD_DIR/harden-admin-vhost.py" "$VHOST" "$BACKUP/candidate.conf" > "$BACKUP/transformation.json"

MODIFIED=0
recover() {
  trap - ERR
  set +e
  if [[ $MODIFIED -eq 1 ]]; then
    cat "$BACKUP/before-vhost.conf" > "$VHOST"
    if [[ -f $BACKUP/before-snippet.conf ]]; then
      cp -a "$BACKUP/before-snippet.conf" "$SNIPPET"
    else
      rm -f "$SNIPPET"
    fi
    if nginx -t >> "$BACKUP/rollback.log" 2>&1; then
      systemctl reload nginx >> "$BACKUP/rollback.log" 2>&1
    fi
  fi
  echo "Nginx update failed; previous configuration restored. Inspect $BACKUP." >&2
  exit 1
}
trap recover ERR

MODIFIED=1
install -d -m 755 /etc/nginx/snippets
install -m 644 "$PAYLOAD_DIR/ctxhub-security-headers.conf" "$SNIPPET"
# Writing through the existing file preserves its owner and permissions.
cat "$BACKUP/candidate.conf" > "$VHOST"
nginx -t > "$BACKUP/after-validation.log" 2>&1
systemctl reload nginx
systemctl is-active --quiet nginx

VERIFIED=0
# systemctl reload returns before Nginx has started its new workers. Poll fresh
# connections instead of treating one response from an old worker as a failure.
for attempt in {1..20}; do
  for entry in 'index|/index.html' 'spa|/faturalandirma'; do
    name=${entry%%|*}
    request_path=${entry#*|}
    curl -sS --max-time 3 --resolve ctxhub.net:443:127.0.0.1 \
      -D "$BACKUP/$name-headers.txt" -o /dev/null "https://ctxhub.net$request_path" || true
  done
  if python3 - "$BACKUP" > "$BACKUP/header-check.json" <<'PYVERIFY'
from pathlib import Path
import json
import sys
results = []
valid = True
for filename in ['index-headers.txt', 'spa-headers.txt']:
    lines = (Path(sys.argv[1]) / filename).read_text().splitlines()
    headers = {}
    for line in lines:
        if ':' in line:
            key, value = line.split(':', 1)
            headers[key.lower()] = value.strip()
    wanted = ['x-content-type-options', 'x-frame-options', 'strict-transport-security',
              'content-security-policy', 'cache-control']
    current = {key: headers.get(key) for key in wanted}
    current['response'] = lines[0] if lines else 'no response'
    current['file'] = filename
    results.append(current)
    valid = valid and ' 200' in current['response']
    valid = valid and headers.get('x-content-type-options') == 'nosniff'
    valid = valid and headers.get('x-frame-options') == 'DENY'
    valid = valid and 'max-age=31536000' in headers.get('strict-transport-security', '')
    valid = valid and "frame-ancestors 'none'" in headers.get('content-security-policy', '')
    valid = valid and headers.get('cache-control') == 'no-cache'
print(json.dumps({'valid': valid, 'responses': results}))
sys.exit(0 if valid else 1)
PYVERIFY
  then
    VERIFIED=1
    break
  fi
  sleep 1
done
if [[ $VERIFIED -ne 1 ]]; then
  cat "$BACKUP/header-check.json"
  false
fi
trap - ERR
echo "OK: ctxhub.net security headers and HTML no-cache applied; nginx active. Rollback: $BACKUP"
