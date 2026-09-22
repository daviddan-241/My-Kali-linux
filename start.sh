#!/bin/bash
# Kali Terminal boot: Tor first, then the app.
mkdir -p /var/lib/tor /var/log/tor
if command -v tor >/dev/null 2>&1; then
  chown -R debian-tor:debian-tor /var/lib/tor /var/log/tor 2>/dev/null || true
  if id debian-tor >/dev/null 2>&1; then
    su -s /bin/sh -c 'tor --DataDirectory /var/lib/tor --SocksPort 127.0.0.1:9050 --Log "notice file /var/log/tor/tor.log" &' debian-tor
  else
    tor --DataDirectory /var/lib/tor --SocksPort 127.0.0.1:9050 --Log "notice file /var/log/tor/tor.log" &
  fi
  echo "[boot] tor starting on 127.0.0.1:9050 ..."
  for i in $(seq 1 30); do
    if timeout 1 bash -c '</dev/tcp/127.0.0.1/9050' 2>/dev/null; then
      echo "[boot] tor socks ready"
      break
    fi
    sleep 1
  done
else
  echo "[boot] tor not found, starting without it"
fi
exec node server.js
