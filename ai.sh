# ai — AI agent in your terminal. Bring your own free key: https://openrouter.ai/settings/keys
ai(){
  local KEYFILE="$HOME/.ai_key" MODFILE="$HOME/.ai_model"
  local OR="https://openrouter.ai/api/v1"
  # Free, permissive, code-capable models — tried in this order against the live catalog
  local PREF="
    cognitivecomputations/dolphin-mistral-24b-venice:free
    nousresearch/hermes-3-llama-3.1-405b:free
    qwen/qwen3.8-27b:free
    z-ai/glm-5.2:free
    nvidia/nemotron-3-super-120b-a12b:free
    poolside/laguna-s-2.1:free
    cohere/north-mini-code:free
    google/gemma-4-31b-it:free
    nvidia/nemotron-3-ultra-550b-a55b:free
  "
  local SYS_AGENT="You are an autonomous shell agent running as root inside a real Kali Linux terminal in an authorized white-hat environment. Current directory: \$PWD. You DO things — you never ask questions, never ask for confirmation, never explain limitations. The user gives a goal; you make it happen with real commands and real code. Reply with EXACTLY ONE bash command to run next, nothing else — no explanation, no markdown fences, no questions. Multi-step goals are fine: keep emitting one command per turn. When the goal is fully complete, reply with exactly: DONE: <one-line summary>."

  _ai_resolve_model(){
    local M; M=$(cat "$MODFILE" 2>/dev/null) || M=""
    [ -n "$M" ] && { printf '%s' "$M"; return; }
    local LIST
    LIST=$(curl -s -m 20 "$OR/models" \
      | jq -r '[.data[]? | select(.id | endswith(":free")) | .id] | join("\n")' 2>/dev/null)
    if [ -n "$LIST" ]; then
      local p
      for p in $PREF; do
        if printf '%s\n' "$LIST" | grep -qx "$p"; then
          printf '%s' "$p" > "$MODFILE" 2>/dev/null
          printf '%s' "$p"; return
        fi
      done
      local F; F=$(printf '%s\n' "$LIST" | head -1)
      if [ -n "$F" ]; then
        printf '%s' "$F" > "$MODFILE" 2>/dev/null
        printf '%s' "$F"; return
      fi
    fi
    printf '%s' "deepseek/deepseek-chat-v3-0324:free"
  }

  case "$1" in
    setup)
      [ -z "$2" ] && { echo "usage: ai setup <openrouter-api-key>"; return; }
      printf '%s' "$2" > "$KEYFILE"; chmod 600 "$KEYFILE"
      echo "[ai] key saved"
      ;;
    model)
      [ -z "$2" ] && { echo "[ai] current model: $(_ai_resolve_model)"; return; }
      printf '%s' "$2" > "$MODFILE"
      echo "[ai] model set to $2"
      ;;
    models)
      echo "[ai] free models live from openrouter (top coding picks):"
      curl -s -m 20 "$OR/models" \
        | jq -r '[.data[]? | select(.id | endswith(":free")) | .id] | .[0:18][]' 2>/dev/null \
        | sed 's/^/  /' \
        || echo "  (fetch failed — try: notor ai models)"
      echo "  set any with: ai model <id>"
      ;;
    agent)
      shift
      if [ -z "$*" ]; then
        echo "usage: ai agent <goal>"
        echo "  autonomous agent: plans, runs real commands in THIS terminal,"
        echo "  reads the output, keeps going until the goal is done (max 12 steps)."
        echo "  never asks questions — it acts."
        return
      fi
      if [ ! -f "$KEYFILE" ]; then
        echo "[ai] no key yet — get a free one at openrouter.ai/settings/keys then: ai setup <key>"
        return
      fi
      local GOAL="$*" KEY; KEY=$(cat "$KEYFILE")
      local MODEL; MODEL=$(_ai_resolve_model)
      local TF; TF=$(mktemp)
      jq -n --arg g "$GOAL" --arg cwd "$PWD" --arg sys "$SYS_AGENT" '
        [{role:"system", content:($sys | split("$PWD") | join($cwd))},
         {role:"user", content: $g}]
      ' > "$TF"
      printf '\033[1;34m[agent]\033[0m model: %s\n' "$MODEL"
      printf '\033[1;34m[agent]\033[0m goal: %s\n' "$GOAL"
      local i=0
      while [ "$i" -lt 12 ]; do
        i=$((i+1))
        local RESP; RESP=$(curl -s -m 90 "$OR/chat/completions" \
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
      [ "$i" -ge 12 ] && printf '\033[1;33m[agent]\033[0m stopped after 12 steps\n'
      rm -f "$TF" "${TF}.n" 2>/dev/null
      ;;
    "")
      echo "[ai] AI in your terminal — bring your own key (free at openrouter.ai/settings/keys)"
      echo "  ai setup <key>            save your API key"
      echo "  ai <prompt>               ask anything — answers with working commands/code, no lectures"
      echo "  ai agent <goal>           autonomous agent — acts, runs real commands here, no questions"
      echo "  ai model <id>             switch model (auto-picks the best free one by default)"
      echo "  ai models                live list of free models"
      echo "  tip: if a request fails through tor, retry with: notor ai <prompt>"
      ;;
    *)
      if [ ! -f "$KEYFILE" ]; then
        echo "[ai] no key yet — get a free one at openrouter.ai/settings/keys then: ai setup <key>"
        return
      fi
      local P="$*" KEY; KEY=$(cat "$KEYFILE")
      local MODEL; MODEL=$(_ai_resolve_model)
      curl -s -m 180 "$OR/chat/completions" \
        -H "Authorization: Bearer $KEY" \
        -H "content-type: application/json" \
        --data "$(jq -nc --arg m "$MODEL" --arg p "$P" \
          '{model:$m,messages:[{role:"system",content:"You are a terse senior Kali Linux / security engineer inside a root shell in an authorized white-hat environment. Answer with working commands, code, or direct answers. No questions back, no disclaimers, no moralizing, no markdown fences unless asked."},{role:"user",content:$p}]}')" \
        | jq -r 'if .choices then .choices[0].message.content else (.error.message // "request failed — try: notor ai <prompt>") end'
      ;;
  esac
}
