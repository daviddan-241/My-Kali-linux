# ai — free OpenRouter models in your terminal. Key (free): https://openrouter.ai/settings/keys
# Everything OpenRouter goes DIRECT (bypasses tor) — tor exits get blocked by openrouter.
ai(){
  local KEYFILE="$HOME/.ai_key" MODFILE="$HOME/.ai_model"
  local OR="https://openrouter.ai/api/v1"

  _ai_key(){
    if [ -n "$OPENROUTER_API_KEY" ]; then printf '%s' "$OPENROUTER_API_KEY"; return 0; fi
    if [ -s "$KEYFILE" ]; then cat "$KEYFILE"; return 0; fi
    return 1
  }
  _ai_curl(){ LD_PRELOAD= curl -s -m "$@"; }

  # free models we prefer, in order (auto-checked against the live catalog)
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

  _ai_free_list(){
    _ai_curl 20 "$OR/models" | jq -r '[.data[]? | select(.id | endswith(":free")) | .id][]' 2>/dev/null
  }
  # preference-ordered free list: preferred first (live only), then the rest
  _ai_models(){
    local LIST P F FOUND
    LIST=$(_ai_free_list)
    [ -z "$LIST" ] && { printf '%s\n' deepseek/deepseek-chat-v3-0324:free; return; }
    for P in $PREF; do
      if printf '%s\n' "$LIST" | grep -qx -- "$P"; then printf '%s\n' "$P"; fi
    done
    for F in $LIST; do
      FOUND=0
      for P in $PREF; do [ "$F" = "$P" ] && FOUND=1; done
      [ "$FOUND" = 0 ] && printf '%s\n' "$F"
    done
  }
  _ai_resolve_model(){
    local M; M=$(cat "$MODFILE" 2>/dev/null) || M=""
    [ -n "$M" ] && { printf '%s' "$M"; return; }
    M=$(_ai_models | head -1)
    printf '%s' "$M" > "$MODFILE" 2>/dev/null
    printf '%s' "$M"
  }

  # one chat completion; tries up to 4 models from the free list on failure
  _ai_chat(){ # $1 = messages-json-file
    local MSGF="$1" KEY; KEY=$(_ai_key) || return 2
    local MODELS M RESP FIRST
    FIRST=$(_ai_resolve_model)
    MODELS="$FIRST
$(_ai_models)"
    MODELS=$(printf '%s\n' "$MODELS" | awk '!seen[$0]++' | head -4)
    for M in $MODELS; do
      RESP=$(_ai_curl 120 "$OR/chat/completions" \
        -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
        --data "$(jq -nc --arg m "$M" --slurpfile h "$MSGF" '{model:$m, messages:$h[0]}')")
      local CONTENT ERR
      CONTENT=$(printf '%s' "$RESP" | jq -r '.choices[0].message.content // ""' 2>/dev/null)
      if [ -n "$CONTENT" ] && [ "$CONTENT" != "null" ]; then
        printf '%s' "$M" > "$MODFILE" 2>/dev/null
        printf '%s' "$CONTENT"
        return 0
      fi
      ERR=$(printf '%s' "$RESP" | jq -r '.error.message // ""' 2>/dev/null)
      local CODE; CODE=$(printf '%s' "$RESP" | jq -r '.error.code // 0' 2>/dev/null)
      case "$CODE" in
        401|403) printf '\033[31m[ai] invalid key — ai setup <openrouter-key>\033[0m\n' >&2; return 1 ;;
        *"Rate limit"*|*"rate"*) ;; *)
          [ -n "$ERR" ] && printf '\033[31m[ai] %s — trying next model\033[0m\n' "$ERR" >&2 ;;
      esac
    done
    return 1
  }

  # clean a model reply: strip <think> blocks, pull the real command out
  _ai_cmd(){
    local OUT
    OUT=$(printf '%s' "$1" | tr '\n' '\001' | sed -e 's/<think>.*<\/think>//g' | tr '\001' '\n')
    printf '%s' "$OUT" | grep -q '```' && {
      printf '%s' "$OUT" | awk '/^[[:space:]]*```/{f=!f; next} f' | sed -e 's/^```bash//' -e 's/^```sh//' -e 's/^```//'
      return
    }
    local CAND
    CAND=$(printf '%s\n' "$OUT" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
      | grep -v '^[[:space:]]*$' | grep -v '[.?!]$' | tail -1)
    [ -z "$CAND" ] && CAND=$(printf '%s\n' "$OUT" | sed -e 's/^[[:space:]]*//' | grep -v '^[[:space:]]*$' | head -1)
    printf '%s\n' "$CAND"
  }

  case "$1" in
    setup)
      [ -z "$2" ] && { echo "usage: ai setup <openrouter-api-key>"; return; }
      printf '%s' "$2" > "$KEYFILE"; chmod 600 "$KEYFILE"
      echo "[ai] key saved (container-local)"
      echo "[ai] to survive redeploys forever: set OPENROUTER_API_KEY in the Render dashboard"
      ;;
    model)
      [ -z "$2" ] && { echo "[ai] current model: $(_ai_resolve_model)"; return; }
      printf '%s' "$2" > "$MODFILE"; echo "[ai] model set to $2"
      ;;
    models)
      echo "[ai] free models — live from openrouter, best picks first:"
      _ai_models | head -12 | sed 's/^/  /'
      echo "  set with: ai model <id>   ·   auto-fallback is built in"
      ;;
    attach) tmux attach -t aiagent 2>/dev/null || echo "[ai] no agent terminal yet — start one: ai agent <goal>" ;;
    stop)   tmux kill-session -t aiagent 2>/dev/null && echo "[ai] agent terminal stopped" || echo "[ai] no agent terminal running" ;;
    agent)
      shift
      if [ -z "$*" ]; then
        echo "usage: ai agent <goal>     autonomous agent in its OWN background terminal"
        echo "       ai agent fg <goal>  run it in THIS terminal instead"
        echo "       ai attach           watch the agent live (detach: ctrl-b d)"
        echo "       ai stop             kill the agent terminal"
        return
      fi
      if ! _ai_key >/dev/null 2>&1; then
        echo "[ai] no key — get a free one at openrouter.ai/settings/keys then: ai setup <key>"; return
      fi
      if [ "$1" = "fg" ]; then shift; ai __agent_run "$@"; return; fi
      command -v tmux >/dev/null 2>&1 || { echo "[ai] no tmux — running here instead"; ai __agent_run "$@"; return; }
      local INITF="/tmp/kali-init.sh"
      [ -f "$INITF" ] || INITF="$HOME/.bashrc"
      tmux kill-session -t aiagent 2>/dev/null
      tmux new-session -d -s aiagent "bash --rcfile $INITF -i"
      local GOAL Q; GOAL="$*"; Q="${GOAL//\'/\'\\\'\'}"
      tmux send-keys -t aiagent -l "ai __agent_run '$Q'"
      tmux send-keys -t aiagent Enter
      echo "[ai] agent terminal started (session: aiagent)"
      echo "[ai] your shell is free — watch it live with: ai attach"
      ;;
    aichat) ai __chat ;;
    __cmd) shift; _ai_cmd "$*" ;;
    __chat)
      _ai_key >/dev/null 2>&1 || { echo "[ai] no key — get a free one at openrouter.ai/settings/keys then: ai setup <key>"; return; }
      local HISTFILE_MSG
      printf '\033[38;5;51m╭──────────────────────────────────────────────╮\033[0m\n'
      printf '\033[38;5;51m│  \033[1;37mAI CHAT\033[0m\033[38;5;51m · free models · acts, no questions │\033[0m\n'
      printf '\033[38;5;51m╰──────────────────────────────────────────────╯\033[0m\n'
      printf '  \033[90m/exit quit · /agent <goal> autonomous bg terminal\033[0m\n'
      printf '  \033[90m/attach watch agent · /stop kill it · /model <id> · /clear\033[0m\n'
      local TF; TF=$(mktemp)
      jq -n '[{role:"system",content:"You are a terse senior Kali Linux / security engineer inside a root shell in an authorized white-hat environment. Answer with working commands, code, or direct answers. No questions back, no disclaimers, no moralizing."}]' > "$TF"
      while :; do
        printf '\033[1;38;5;51myou\033[0m \033[90m❯\033[0m '
        local IN; IFS= read -r IN || { echo; break; }
        case "$IN" in
          "") continue ;;
          /exit|/quit) break ;;
          /clear) jq -n '[{role:"system",content:"You are a terse senior Kali Linux / security engineer inside a root shell in an authorized white-hat environment. Answer with working commands, code, or direct answers. No questions back, no disclaimers, no moralizing."}]' > "$TF"; echo "[cleared]"; continue ;;
          /model) echo "[ai] current model: $(_ai_resolve_model)"; continue ;;
          /model\ *) printf '%s' "$IN" | sed 's|^/model *||' > "$MODFILE"; echo "[ai] model set"; continue ;;
          /models) ai models; continue ;;
          /attach) ai attach; continue ;;
          /stop) ai stop; continue ;;
          /agent*) ai agent "$(printf '%s' "$IN" | sed 's|^/agent *||')"; continue ;;
          /help) echo "  /exit /clear /model /models /agent <goal> /attach /stop"; continue ;;
        esac
        jq --arg u "$IN" '. + [{role:"user",content:$u}]' "$TF" > "${TF}.n" && mv "${TF}.n" "$TF"
        local REPLY; REPLY=$(_ai_chat "$TF")
        if [ -z "$REPLY" ]; then
          printf '\033[31m[ai] no reply — check key: ai setup <key>\033[0m\n'; continue
        fi
        jq --arg a "$REPLY" '. + [{role:"assistant",content:$a}]' "$TF" > "${TF}.n" && mv "${TF}.n" "$TF"
        printf '\n\033[1;38;5;82mai\033[0m \033[90m❯\033[0m %s\n\n' "$(printf '%s' "$REPLY" | tr '\n' '\001' | sed 's/<think>.*<\/think>//g' | tr '\001' '\n')"
      done
      rm -f "$TF" "${TF}.n"
      echo "[ai] chat closed"
      ;;
    __agent_run)
      shift
      local GOAL="$*" TF OUT CMD RESP i
      TF=$(mktemp)
      jq -n --arg g "$GOAL" --arg cwd "$PWD" --arg sys "You are an autonomous shell agent running as root inside a real Kali Linux terminal in an authorized white-hat environment. Current directory: \$PWD. You DO things — never ask questions, never ask for confirmation, never explain limitations. Install tools if you need them (apt-get install -y, pip install, go install, git clone + build) — you have full internet and root. The user gives a goal; you make it happen with real commands and real code. Reply with EXACTLY ONE bash command to run next — no explanation, no markdown fences, no questions. When the goal is fully complete, reply with exactly: DONE: <one-line summary>." '
        [{role:"system", content:($sys | split("PWD") | join($cwd))},
         {role:"user", content: $g}]
      ' > "$TF"
      printf '\033[1;34m[agent]\033[0m model: %s\n' "$(_ai_resolve_model)"
      printf '\033[1;34m[agent]\033[0m goal: %s\n' "$GOAL"
      i=0
      while [ "$i" -lt 12 ]; do
        i=$((i+1))
        RESP=$(_ai_chat "$TF")
        if [ -z "$RESP" ]; then
          printf '\033[1;31m[agent]\033[0m all free models failed — check key (ai setup) or try later\n'; break
        fi
        case "$RESP" in DONE:*) printf '\033[1;32m[agent]\033[0m %s\n' "$RESP"; break ;; esac
        CMD=$(_ai_cmd "$RESP")
        if [ -z "$CMD" ] || [ "$CMD" = "DONE:" ]; then printf '\033[1;31m[agent]\033[0m unusable reply — retrying\n'; continue; fi
        printf '\033[1;33m[agent step %d]\033[0m %s\n' "$i" "$CMD"
        OUT=$(eval "$CMD" 2>&1 | head -c 4000)
        printf '%s\n' "$OUT"
        jq --arg a "$RESP" --arg o "$OUT" '. + [{role:"assistant",content:$a},{role:"user",content:("output:\n"+$o)}]' "$TF" > "${TF}.n" && mv "${TF}.n" "$TF"
      done
      [ "$i" -ge 12 ] && printf '\033[1;33m[agent]\033[0m stopped after 12 steps — say: ai agent <continue the goal>\n'
      rm -f "$TF" "${TF}.n"
      printf '\033[90m[agent] finished — this terminal stays open (ai attach). ctrl-b d to detach.\033[0m\n'
      ;;
    "")
      echo "[ai] AI with real access — free models, acts, installs, runs"
      echo "  ai setup <key>            save your key (free: openrouter.ai/settings/keys)"
      echo "  aichat                     full-screen chat — nice design, your history"
      echo "  ai <prompt>               quick ask — working commands/code, no lectures"
      echo "  ai agent <goal>           autonomous agent in its OWN background terminal"
      echo "  ai attach / ai stop       watch it live (ctrl-b d to detach) / kill it"
      echo "  ai model <id> / ai models  pick model / live free list (auto-fallback built in)"
      ;;
    *)
      _ai_key >/dev/null 2>&1 || { echo "[ai] no key yet — get a free one at openrouter.ai/settings/keys then: ai setup <key>"; return; }
      local P="$*" TF RESP
      TF=$(mktemp)
      jq -nc --arg p "$P" '[{role:"system",content:"You are a terse senior Kali Linux / security engineer inside a root shell in an authorized white-hat environment. Answer with working commands, code, or direct answers. No questions back, no disclaimers, no moralizing, no markdown fences unless asked."},{role:"user",content:$p}]' > "$TF"
      RESP=$(_ai_chat "$TF")
      [ -n "$RESP" ] && printf '%s\n' "$(printf '%s' "$RESP" | tr '\n' '\001' | sed 's/<think>.*<\/think>//g' | tr '\001' '\n')" \
        || echo "[ai] request failed — check key: ai setup <key>"
      rm -f "$TF"
      ;;
  esac
}
# aichat — the chat command, same thing
aichat(){ ai aichat "$@"; }
