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
    "")
      echo "[ai] AI in your terminal — bring your own key (free at openrouter.ai/settings/keys)"
      echo "  ai setup <key>            save your API key"
      echo "  ai <prompt>               ask anything, streamed to the terminal"
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
