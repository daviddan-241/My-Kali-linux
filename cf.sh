# cf — Cloudflare Tunnel: instant public HTTPS link for any local port, no account needed.
# Use this for a server/app YOU run inside this terminal (e.g. `python3 -m http.server 8000`
# then `cf 8000`). For sharing files/folders, use the 'share' command instead.
cf(){
  local PORT="${1:-}"
  if [ -z "$PORT" ]; then
    printf '\033[1;34m[cf]\033[0m usage: cf <local-port>\n'
    echo "  starts a Cloudflare quick tunnel and prints a real https://*.trycloudflare.com link"
    echo "  that works from any browser, any phone, anywhere."
    return
  fi
  if ! command -v cloudflared >/dev/null 2>&1; then
    printf '\033[1;31m[cf]\033[0m cloudflared not found\n'
    return
  fi
  printf '\033[1;34m[cf]\033[0m opening a tunnel to 127.0.0.1:%s ...\n' "$PORT"
  cloudflared tunnel --url "http://127.0.0.1:${PORT}" 2>&1 | grep --line-buffered -o 'https://[a-zA-Z0-9.-]*trycloudflare.com' | while read -r url; do
    printf '\033[1;32m[cf]\033[0m live: \033[1m%s\033[0m  (Ctrl+C to stop)\n' "$url"
  done
}
