# ai — AI agent in your terminal. Bring your own free key: https://openrouter.ai/settings/keys
ai(){
  local KEYFILE="$HOME/.ai_key" MODFILE="$HOME/.ai_model"
  local MODEL
  MODEL=$(cat "$MODFILE" 2>/dev/null || echo "deepseek/deepseek-chat-v3-0324:free")
  case "$1" in
    setup)
      [ -z "$2" ] && { echo "usage: ai setup <openrouter-api-key>"; return; }
      printf '%s' "$2" > "$KEYFILE"; chmod 600 "$KEYFILE"
      echo "[ai] key saved"
      ;;
    model)
      [ -z "$2" ] && { echo "[ai] current model: $MODEL"; return; }
      printf '%s' "$2" > "$MODFILE"
      echo "[ai] model set to $2"
      ;;
    models)
      echo "[ai] free models (browse all at openrouter.ai/collections/free-models):"
      echo "  deepseek/deepseek-chat-v3-0324:free"
      echo "  meta-llama/llama-4-maverick:free"
      echo "  set any model with: ai model <id>"
      ;;
    agent)
      shift
      if [ -z "$*" ]; then
        echo "usage: ai agent <goal>"
        echo "  a real autonomous coding/shell agent (Goose/OpenHands-style):"
        echo "  it plans, runs real commands in THIS terminal, reads the output,"
        echo "  and keeps going on its own until the goal is done (max 10 steps)."
        return
      fi
      if [ ! -f "$KEYFILE" ]; then
        echo "[ai] no key yet — get a free one at openrouter.ai/settings/keys then: ai setup <key>"
        return
      fi
      local GOAL="$*" KEY; KEY=$(cat "$KEYFILE")
      local TF; TF=$(mktemp)
      jq -n --arg g "$GOAL" --arg cwd "$PWD" '
        [{role:"system", content:
          "You are an autonomous shell agent running as root inside a real Kali Linux terminal. Current directory: " + $cwd + ". "
          + "The user gives you a goal. Reply with EXACTLY ONE bash command to run next, nothing else — no explanation, no markdown fences. "
          + "When the goal is fully complete, reply with exactly: DONE: <one-line summary of what you did>. "
          + "Be efficient. Prefer real working commands over placeholders."
        },
        {role:"user", content: $g}]
      ' > "$TF"
      printf '\033[1;34m[agent]\033[0m goal: %s\n' "$GOAL"
      local i=0
      while [ "$i" -lt 10 ]; do
        i=$((i+1))
        local RESP; RESP=$(curl -s -m 90 https://openrouter.ai/api/v1/chat/completions \
          -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
          --data "$(jq -nc --arg m "$MODEL" --slurpfile h "$TF" '{model:$m, messages:$h[0]}')")
        local MSG; MSG=$(printf '%s' "$RESP" | jq -r '.choices[0].message.content // (.error.message // "")')
        if [ -z "$MSG" ]; then
          printf '\033[1;31m[agent]\033[0m no response (try: notor ai agent %s)\n' "$GOAL"; break
        fi
        if printf '%s' "$MSG" | grep -q '^DONE:'; then
          printf '\033[1;32m[agent]\033[0m %s\n' "$MSG"; break
        fi
        local CMD; CMD=$(printf '%s' "$MSG" | sed -e 's/^```bash//' -e 's/^```sh//' -e 's/^```//' -e 's/```$//' | head -1)
        printf '\033[1;33m[agent step %d]\033[0m %s\n' "$i" "$CMD"
        local OUT; OUT=$(eval "$CMD" 2>&1 | head -c 4000)
        printf '%s\n' "$OUT"
        jq --arg a "$MSG" --arg o "$OUT" '. + [{role:"assistant",content:$a},{role:"user",content:("output:\n"+$o)}]' "$TF" > "${TF}.n" && mv "${TF}.n" "$TF"
      done
      [ "$i" -ge 10 ] && printf '\033[1;33m[agent]\033[0m stopped after 10 steps\n'
      rm -f "$TF" "${TF}.n" 2>/dev/null
      ;;
    "")
      echo "[ai] AI in your terminal — bring your own key (free at openrouter.ai/settings/keys)"
      echo "  ai setup <key>            save your API key"
      echo "  ai <prompt>               ask anything, streamed to the terminal"
      echo "  ai agent <goal>           autonomous agent — plans + runs real commands here"
      echo "  ai model <id>             switch model"
      echo "  ai models                 free model suggestions"
      echo "  tip: if a request fails through tor, retry with: notor ai <prompt>"
      ;;
    *)
      if [ ! -f "$KEYFILE" ]; then
        echo "[ai] no key yet — get a free one at openrouter.ai/settings/keys then: ai setup <key>"
        return
      fi
      local P="$*"
      curl -s -m 180 https://openrouter.ai/api/v1/chat/completions \
        -H "Authorization: Bearer $(cat "$KEYFILE")" \
        -H "content-type: application/json" \
        --data "$(jq -nc --arg m "$MODEL" --arg p "$P" '{model:$m,messages:[{role:"user",content:$p}]}')" \
        | jq -r 'if .choices then .choices[0].message.content else (.error.message // "request failed — try: notor ai <prompt>") end'
      ;;
  esac
}
