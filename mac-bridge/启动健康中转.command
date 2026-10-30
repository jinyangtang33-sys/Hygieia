#!/bin/zsh
set -e
cd "${0:A:h}"
umask 077
if /usr/bin/python3 - <<'PYLOCAL'
import json,urllib.request,sys
try:
    with urllib.request.urlopen('http://127.0.0.1:8765/healthz',timeout=2) as r:
        sys.exit(0 if json.load(r).get('receiver')=='selfspace-mac-v1' else 1)
except Exception: sys.exit(1)
PYLOCAL
then
  open 'http://127.0.0.1:8765'
  exit 0
fi
mkdir -p ../.bridge-runtime
if [[ ! -x ../.bridge-runtime/keychain || keychain.swift -nt ../.bridge-runtime/keychain ]]; then
  echo '正在准备本机钥匙串组件…'
  xcrun swiftc -module-cache-path ../.bridge-runtime/swift-cache keychain.swift -o ../.bridge-runtime/keychain
fi
export PYTHONPYCACHEPREFIX="${0:A:h:h}/.bridge-runtime/pycache"
exec /usr/bin/python3 bridge.py
