# Zevio AI — one command: `start`. Free OpenRouter models, real execution, real memory.
# Everything OpenRouter-bound goes DIRECT (bypasses tor) — tor exits get blocked by openrouter.
# Set AI_DEBUG=1 in the shell before `start` to see raw provider fallback chatter.

_AI_OR="https://openrouter.ai/api/v1"
_AI_KEYFILE="$HOME/.ai_key"
_AI_MODFILE="$HOME/.ai_model"
_AI_THREAD="$HOME/.ai_thread.json"
_AI_HIST="$HOME/.ai_history.log"
_AI_PINF="$HOME/.ai_pin"

_ai_key(){
  # any single key (used by status checks)
  if [ -n "$OPENROUTER_API_KEY" ]; then printf '%s' "$OPENROUTER_API_KEY"; return 0; fi
  if [ -n "$OPENROUTER_API_KEY_2" ]; then printf '%s' "$OPENROUTER_API_KEY_2"; return 0; fi
  if [ -s "$_AI_KEYFILE" ]; then cat "$_AI_KEYFILE"; return 0; fi
  return 1
}
# every key we have, one per line, last-working-one first; when a key hits its
# free daily limit the next one is tried automatically, so multiple keys pool
# together into one bigger daily allowance.
_AI_LASTKEYF="$HOME/.ai_lastkey"
_ai_keys(){
  local LAST; LAST=$(cat "$_AI_LASTKEYF" 2>/dev/null)
  {
    [ -n "$LAST" ]                  && printf '%s\n' "$LAST"
    [ -n "$OPENROUTER_API_KEY" ]    && printf '%s\n' "$OPENROUTER_API_KEY"
    [ -n "$OPENROUTER_API_KEY_2" ]  && printf '%s\n' "$OPENROUTER_API_KEY_2"
    [ -n "$OPENROUTER_API_KEY_3" ]  && printf '%s\n' "$OPENROUTER_API_KEY_3"
    [ -s "$_AI_KEYFILE" ]           && cat "$_AI_KEYFILE"
  } | awk 'length($0)>0 && !seen[$0]++'
}
_ai_nkeys(){ _ai_keys | wc -l; }
_ai_curl(){ LD_PRELOAD= curl -s -m "$@"; }

# Never hardcode a specific model id — the free catalog rotates constantly (proven
# twice already: last week's "best picks" are gone this week). Everything here is
# ranked LIVE against whatever OpenRouter actually serves right now. Cached 10min
# so we're not refetching the whole catalog on every single message (that was slow).
_AI_CACHE="$HOME/.ai_models_cache"
_ai_free_list(){
  local AGE
  if [ -f "$_AI_CACHE" ]; then
    AGE=$(( $(date +%s) - $(stat -c %Y "$_AI_CACHE" 2>/dev/null || echo 0) ))
    if [ "$AGE" -lt 600 ] && [ -s "$_AI_CACHE" ]; then cat "$_AI_CACHE"; return; fi
  fi
  local LIST; LIST=$(_ai_curl 15 "$_AI_OR/models" | jq -r '[.data[]? | select(.id | endswith(":free")) | .id][]' 2>/dev/null)
  if [ -n "$LIST" ]; then printf '%s\n' "$LIST" > "$_AI_CACHE"; printf '%s\n' "$LIST"; return; fi
  [ -s "$_AI_CACHE" ] && cat "$_AI_CACHE"
}
# Known-good permissive/capable model FAMILIES by name pattern — matched against
# whatever's actually live, never assumed to exist. Real id always wins over guess.
# uncensored / derestricted fine-tune families first — the user's explicit
# preference — then the strongest capable families, all still live-ranked.
_AI_FAMILIES="dolphin venice hermes uncensored abliterated derestricted unshackled heretic mistral-24b nemotron-3-ultra nemotron-3-super glm-5 glm-4 qwen3 deepseek gemma-4 llama-4 grok"
_ai_models(){
  local LIST F P FOUND
  LIST=$(_ai_free_list)
  [ -z "$LIST" ] && return
  for P in $_AI_FAMILIES; do
    printf '%s\n' "$LIST" | grep -i -- "$P"
  done | awk '!seen[$0]++'
  for F in $LIST; do
    FOUND=0
    for P in $_AI_FAMILIES; do printf '%s' "$F" | grep -qi -- "$P" && FOUND=1; done
    [ "$FOUND" = 0 ] && printf '%s\n' "$F"
  done
}
_ai_resolve_model(){
  local M; M=$(cat "$_AI_MODFILE" 2>/dev/null) || M=""
  [ -n "$M" ] && { printf '%s' "$M"; return; }
  M=$(_ai_models | head -1)
  printf '%s' "$M" > "$_AI_MODFILE" 2>/dev/null
  printf '%s' "$M"
}

# one chat completion; silently tries up to 4 free models before giving up.
# The real reason is written to $_AI_ERRFILE — _ai_chat runs inside a $(...)
# subshell from the caller, so a plain variable would never make it back out.
_AI_ERRFILE="$HOME/.ai_lasterr"
_ai_lasterr(){ cat "$_AI_ERRFILE" 2>/dev/null || printf 'could not reach the model provider - try again in a moment.'; }
_AI_ERRRAW="$HOME/.ai_errraw"

_AI_VISION_CACHE="$HOME/.ai_vmodels_cache"
_ai_free_vision_list(){
  local AGE
  if [ -f "$_AI_VISION_CACHE" ]; then
    AGE=$(( $(date +%s) - $(stat -c %Y "$_AI_VISION_CACHE" 2>/dev/null || echo 0) ))
    if [ "$AGE" -lt 600 ] && [ -s "$_AI_VISION_CACHE" ]; then cat "$_AI_VISION_CACHE"; return; fi
  fi
  local JSON; JSON=$(_ai_curl 15 "$_AI_OR/models" 2>/dev/null)
  if [ -n "$JSON" ]; then
    local VMODELS
    VMODELS=$(printf '%s' "$JSON" | jq -r '[.data[]? | select(.id | endswith(":free")) | select((.id | test("vision|vl|qwen-2-vl|llama-3.2-vision|multimodal"; "i")) or ((.architecture.modality? // "") | test("image"; "i"))) | .id][]' 2>/dev/null)
    if [ -n "$VMODELS" ]; then
      printf '%s\n' "$VMODELS" > "$_AI_VISION_CACHE"
      printf '%s\n' "$VMODELS"
      return
    fi
  fi
  [ -s "$_AI_VISION_CACHE" ] && cat "$_AI_VISION_CACHE"
}

_ai_vision_models(){
  local LIST; LIST=$(_ai_free_vision_list)
  if [ -z "$LIST" ]; then
    LIST="qwen/qwen-2-vl-72b-instruct:free
meta-llama/llama-3.2-11b-vision-instruct:free
meta-llama/llama-3.2-90b-vision-instruct:free
qwen/qwen-vl-plus:free"
  fi
  local FAMILIES="qwen2-vl qwen-vl llama-3.2-vision vision vl"
  local P F
  for P in $FAMILIES; do
    printf '%s\n' "$LIST" | grep -i -- "$P"
  done | awk '!seen[$0]++'
  for F in $LIST; do
    local FOUND=0
    for P in $FAMILIES; do printf '%s' "$F" | grep -qi -- "$P" && FOUND=1; done
    [ "$FOUND" = 0 ] && printf '%s\n' "$F"
  done | awk '!seen[$0]++'
}

_ai_vision(){
  local FILE="$1"
  local PROMPT="${2:-Describe this media in detail and highlight anything notable.}"

  if [ -z "$FILE" ]; then
    printf '\033[31merror: missing file path — usage: ai -i <path-to-image-or-video> "question"\033[0m\n' >&2
    return 1
  fi

  if [ ! -f "$FILE" ]; then
    printf '\033[31merror: file "%s" not found\033[0m\n' "$FILE" >&2
    return 1
  fi

  local SIZE_BYTES; SIZE_BYTES=$(stat -c %s "$FILE" 2>/dev/null || wc -c < "$FILE")
  if [ "$SIZE_BYTES" -gt 20971520 ]; then
    printf '\033[31merror: file "%s" is too big (%s MB) — max allowed size is 20MB\033[0m\n' "$FILE" "$((SIZE_BYTES/1048576))" >&2
    return 1
  fi

  local EXT; EXT=$(printf '%s' "${FILE##*.}" | tr '[:upper:]' '[:lower:]')
  local MEDIA_TYPE=""
  case "$EXT" in
    jpg|jpeg|png|gif|webp) MEDIA_TYPE="image" ;;
    mp4|webm|mov) MEDIA_TYPE="video" ;;
    *)
      printf '\033[31merror: unsupported file type ".%s" — expected jpg, png, gif, webp, mp4, webm, mov\033[0m\n' "$EXT" >&2
      return 1
      ;;
  esac

  local MSGF; MSGF=$(mktemp)

  if [ "$MEDIA_TYPE" = "image" ]; then
    local MIME="image/png"
    case "$EXT" in
      jpg|jpeg) MIME="image/jpeg" ;;
      gif) MIME="image/gif" ;;
      webp) MIME="image/webp" ;;
    esac

    local B64; B64=$(base64 -w0 "$FILE" 2>/dev/null || base64 "$FILE" | tr -d '\r\n')
    local DATA_URL="data:${MIME};base64,${B64}"

    jq -n --arg prompt "$PROMPT" --arg url "$DATA_URL" \
      '[{role: "user", content: [{type: "text", text: $prompt}, {type: "image_url", image_url: {url: $url}}]}]' > "$MSGF"
  else
    mkdir -p /tmp/vframes && rm -f /tmp/vframes/*
    local DURATION; DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$FILE" 2>/dev/null)
    if [ -z "$DURATION" ] || [ "$(printf '%.0f' "$DURATION" 2>/dev/null || echo 0)" -eq 0 ]; then
      DURATION=5
    fi

    local FRAMES_JSON="[]"
    local i PCT TS B64 DATA_URL LABEL
    local PCTS=(0 25 50 75 95)
    for i in 0 1 2 3 4; do
      PCT=${PCTS[$i]}
      TS=$(node -e "console.log((${DURATION} * ${PCT} / 100).toFixed(2))" 2>/dev/null || echo 0)
      ffmpeg -ss "$TS" -i "$FILE" -vframes 1 -q:v 2 "/tmp/vframes/frame_${i}.jpg" -y >/dev/null 2>&1
      if [ -f "/tmp/vframes/frame_${i}.jpg" ]; then
        B64=$(base64 -w0 "/tmp/vframes/frame_${i}.jpg" 2>/dev/null || base64 "/tmp/vframes/frame_${i}.jpg" | tr -d '\r\n')
        DATA_URL="data:image/jpeg;base64,${B64}"
        LABEL="frame $((i+1))/5 at ${PCT}%"
        FRAMES_JSON=$(jq -nc --argjson cur "$FRAMES_JSON" --arg label "$LABEL" --arg url "$DATA_URL" \
          '$cur + [{type: "text", text: ("(" + $label + ")")}, {type: "image_url", image_url: {url: $url}}]')
      fi
    done

    jq -n --arg prompt "$PROMPT" --argjson frames "$FRAMES_JSON" \
      '[{role: "user", content: ([{type: "text", text: $prompt}] + $frames)}]' > "$MSGF"
  fi

  local VMODELS; VMODELS=$(_ai_vision_models)
  if [ -z "$VMODELS" ]; then
    printf '\033[31merror: no vision model available on OpenRouter\033[0m\n' >&2
    rm -f "$MSGF"
    return 1
  fi

  printf '\033[1;97m╭───────╮\033[0m\n'
  printf '\033[1;97m│ codex │\033[0m \033[90mvision\033[0m\n'
  printf '\033[1;97m╰───────╯\033[0m\n'
  printf '\033[90m %s · streaming · free-tier\033[0m\n\n' "$(printf '%s' "$VMODELS" | head -1)"

  VISION_MODELS="$VMODELS" _ai_chat "$MSGF"
  local RET=$?
  rm -f "$MSGF"
  printf '\n'
  return $RET
}

_ai_chat(){ # $1 = messages-json-file, $2(optional) = file that also receives the full reply while it streams
  local MSGF="$1" OUTF="${2:-}" KEY M LINE DELTA ERR CODE KEYSLEFT RLKEYS=0 NKEYS=0 GOTANY=0
  _ai_keys | grep -q . || { printf 'no key set - run: ai setup <key>' > "$_AI_ERRFILE"; return 2; }
  local LOCALOUTF=0
  if [ -z "$OUTF" ]; then OUTF=$(mktemp); LOCALOUTF=1; fi
  : > "$OUTF"
  local FIRST MODELS
  if [ -n "${VISION_MODELS:-}" ]; then
    MODELS="$VISION_MODELS"
  else
    FIRST=$(_ai_resolve_model)
    MODELS="$FIRST
$(_ai_models)"
  fi
  # try the whole free catalog, preferred models first - a key with a data-policy
  # guardrail or a flaky provider only blocks SOME models, so the rest still
  # answer. once a key+model works it becomes sticky and future calls are 1 shot.
  MODELS=$(printf '%s\n' "$MODELS" | awk '!seen[$0]++' | head -16)
  : > "$_AI_ERRFILE"; : > "$_AI_ERRRAW"
  NKEYS=$(_ai_nkeys)
  KEYSLEFT=$NKEYS
  while IFS= read -r KEY; do
    for M in $MODELS; do
      GOTANY=0
      # stream:true - deltas are printed live as they arrive, never buffered
      _ai_curl 180 "$_AI_OR/chat/completions" -N \
        -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
        --data "$(jq -nc --arg m "$M" --slurpfile h "$MSGF" '{model:$m, stream:true, messages:$h[0]}')" \
      | while IFS= read -r LINE; do
          case "$LINE" in
            'data: [DONE]') break ;;
            data:*)
              DELTA=$(printf '%s' "${LINE#data: }" | jq -r '.choices[0].delta.content // empty' 2>/dev/null)
              [ -n "$DELTA" ] && { printf '%s' "$DELTA"; [ -n "$OUTF" ] && printf '%s' "$DELTA" >> "$OUTF"; }
              ;;
            *'"error"'*)
              printf '%s' "$LINE" >> "$_AI_ERRRAW"
              ;;
          esac
        done
      if [ -s "$OUTF" ]; then
        printf '%s' "$KEY" > "$_AI_LASTKEYF" 2>/dev/null
        printf '%s' "$M"   > "$_AI_MODFILE"  2>/dev/null
        [ "$LOCALOUTF" = 1 ] && { cat "$OUTF"; rm -f "$OUTF"; }
        return 0
      fi
      ERR=$(cat "$_AI_ERRRAW" | jq -r '.error.message // ""' 2>/dev/null)
      CODE=$(cat "$_AI_ERRRAW" | jq -r '.error.code // 0' 2>/dev/null)
      [ -n "$AI_DEBUG" ] && [ -n "$ERR" ] && printf '\033[90m[key %s/%s - %s: %s]\033[0m\n' "$((KEYSLEFT))" "$(_ai_nkeys)" "$M" "$ERR" >&2
      case "$CODE" in
        401|403) break ;; # bad key - next key, same key won't help other models
      esac
      case "$ERR" in
        *"free-models-per-day"*) RLKEYS=$((RLKEYS+1)); break ;; # this key is done for today - next key
        *"Rate limit"*) sleep 2 ;; # short window limit - give next model a beat
      esac
    done
    KEYSLEFT=$((KEYSLEFT-1))
  done < <(_ai_keys)
  if [ "$RLKEYS" -gt 0 ]; then
    if [ "$RLKEYS" -eq "$NKEYS" ]; then
      printf 'every OpenRouter key (%s) hit the free-tier daily limit today. Fixes: wait for the daily reset, add another key, or add $10 credit at https://openrouter.ai/settings/credits to unlock 1000 free requests/day.' "$NKEYS" > "$_AI_ERRFILE"
    else
      printf '%s of your %s OpenRouter keys hit the free-tier daily limit and the rest failed too. Fixes: wait for the daily reset, add another key, or add $10 credit at https://openrouter.ai/settings/credits to unlock 1000 free requests/day.' "$RLKEYS" "$NKEYS" > "$_AI_ERRFILE"
    fi
  else
    printf 'could not reach the model provider (network hiccup or outage) - try again shortly.' > "$_AI_ERRFILE"
  fi
  return 1
}

_ai_banner(){
  # codex CLI look: compact brand block, then a dim context line
  printf '\033[1;97m╭───────╮\033[0m\n'
  printf '\033[1;97m│ codex │\033[0m\n'
  printf '\033[1;97m╰───────╯\033[0m\n'
  local MOD; MOD=$(_ai_resolve_model)
  printf '\033[90m %s · streaming · free-tier · /help for commands\033[0m\n' "${MOD:-auto model}"
}

_ai_sysprompt(){
  cat <<'EOF'
You are Zevio, a direct and capable AI operator running inside a real root shell on Kali Linux in the user's own environment. Be concise and technical. Skip lectures, moralizing, and unnecessary disclaimers.

Talk normally for greetings, chit-chat, and questions you can just answer — plain text, no commands, no markdown fences.

When the task actually requires the shell (checking something, installing, scanning, fixing, running code, reading files, networking, researching via curl/wget), respond with the exact command(s) to run, each on its own line starting with "RUN: " and nothing else on that line (example: "RUN: nmap -sV 10.0.0.1"). You will be shown the real output right after and can react to it or continue with more RUN: lines.

You are fully autonomous at fixing your own errors. When a RUN: command's output shows an error (missing module, missing package, permission denied, wrong syntax, dependency conflict, network hiccup, whatever), do NOT ask the user what to do and do NOT give up — immediately issue the next RUN: line(s) that diagnose and fix it yourself (install the missing thing, correct the command, retry with the right flags) and keep going until the original task actually works or you've made several real attempts. Only fall back to explaining to the user if you've genuinely exhausted the reasonable fixes.

You can research live: RUN: curl/wget to fetch real docs, package indexes, or APIs when you need current information — you're not limited to what you already know.

Only use RUN: when shell execution is actually needed — never for casual conversation.
EOF
}

_ai_init_thread(){
  jq -n --arg s "$(_ai_sysprompt)" '[{role:"system",content:$s}]' > "$_AI_THREAD"
}
_ai_help(){
  printf ' \033[1;97m/new\033[0m     fresh session (clears the thread)\n'
  printf ' \033[1;97m/save\033[0m    save this session to a file\n'
  printf ' \033[1;97m/list\033[0m     list saved sessions\n'
  printf ' \033[1;97m/model\033[0m    show the current model\n'
  printf ' \033[1;97m/history\033[0m  show recent conversation\n'
  printf ' \033[1;97m/exit\033[0m     leave\n'
}

# runs one user turn to completion: model reply -> execute any RUN: lines -> show model's follow-up. Loops (capped) while it keeps issuing commands.
_ai_turn(){
  local IN="$1" STEP=0 REPLY TEXT CMDS OUTS C O
  [ -s "$_AI_THREAD" ] || _ai_init_thread
  jq --arg u "$IN" '. + [{role:"user",content:$u}]' "$_AI_THREAD" > "${_AI_THREAD}.n" && mv "${_AI_THREAD}.n" "$_AI_THREAD"
  printf '%s\n' "you: $IN" >> "$_AI_HIST"

  local REPLYF; REPLYF=$(mktemp)
  while :; do
    STEP=$((STEP+1))
    # codex look: dim status line, cleared by the first streamed token
    printf '\033[90m codex · thinking…               \033[0m\r'
    if ! _ai_chat "$_AI_THREAD" "$REPLYF"; then
      printf '\033[31mcodex ✗\033[0m %s\n\n' "$(_ai_lasterr)"
      rm -f "$REPLYF"; return
    fi
    printf '\033[K\n'   # wipe any thinking-status residue, end the streamed line
    REPLY=$(cat "$REPLYF"); : > "$REPLYF"
    jq --arg a "$REPLY" '. + [{role:"assistant",content:$a}]' "$_AI_THREAD" > "${_AI_THREAD}.n" && mv "${_AI_THREAD}.n" "$_AI_THREAD"

    CMDS=$(printf '%s\n' "$REPLY" | grep -E '^RUN:[[:space:]]*' | sed -E 's/^RUN:[[:space:]]*//')
    TEXT=$(printf '%s\n' "$REPLY" | grep -vE '^RUN:[[:space:]]*')

    if [ -n "$(printf '%s' "$TEXT" | tr -d '[:space:]')" ]; then
      printf '%s\n' "ai: $TEXT" >> "$_AI_HIST"
    fi

    if [ -z "$CMDS" ]; then printf '\n'; rm -f "$REPLYF"; return; fi
    if [ "$STEP" -ge 6 ]; then
      printf '\033[90m[pausing here — say "continue" for more]\033[0m\n\n'
      return
    fi

    OUTS=""
    printf '\033[90m codex · executing %s command(s)\033[0m\n' "$(printf '%s\n' "$CMDS" | grep -c .)"
    while IFS= read -r C; do
      [ -z "$C" ] && continue
      printf '\033[1;33m$\033[0m %s\n' "$C"
      O=$(eval "$C" 2>&1 | head -c 3000)
      printf '%s\n' "$O"
      printf '%s\n' "\$ $C" >> "$_AI_HIST"
      OUTS="$OUTS
\$ $C
$O
"
    done <<< "$CMDS"
    rm -f "$REPLYF"
    jq --arg o "$OUTS" '. + [{role:"user",content:("[shell output]\n"+$o)}]' "$_AI_THREAD" > "${_AI_THREAD}.n" && mv "${_AI_THREAD}.n" "$_AI_THREAD"
  done
}

# THE one command.
start(){
  if [ -n "$1" ] && [ -n "${1//[0-9]/}" ]; then
    printf '\033[31mpins are digits only\033[0m — to just chat: start\n'; return 1
  fi
  if [ -n "$1" ]; then
    if [ -s "$_AI_PINF" ]; then
      [ "$1" != "$(cat "$_AI_PINF")" ] && { printf '\033[31mwrong pin\033[0m\n'; return 1; }
    else
      printf '%s' "$1" > "$_AI_PINF"; chmod 600 "$_AI_PINF"
      printf '\033[32mpin saved — next time: start %s\033[0m\n' "$1"
    fi
  elif [ -s "$_AI_PINF" ]; then
    printf '\033[33mlocked — start <your-pin>\033[0m\n'; return 1
  fi

  if ! _ai_key >/dev/null 2>&1; then
    printf 'no key yet. get a free one: https://openrouter.ai/settings/keys\nthen run: echo "sk-...yourkey" > ~/.ai_key\n'
    return 1
  fi

  [ -s "$_AI_THREAD" ] || _ai_init_thread

  _ai_banner
  local GR=("ready — what should I work on?" "online. what are we building?" "go ahead." "systems green. go.")
  printf '\033[1;37m %s\033[0m \033[90m· %s\033[0m\n' "${GR[$((RANDOM%4))]}" "$(date '+%a %b %d · %H:%M')"
  printf '\033[90m replies stream live · RUN: commands execute for real · /help for commands\033[0m\n\n'

  local IN
  while :; do
    printf '\033[1;38;5;51myou\033[0m \033[90m❯\033[0m '
    IFS= read -r IN || { echo; break; }
    case "$IN" in
      "") continue ;;
      exit|quit|bye|/exit) break ;;
      history|/history) history ;;
      /help) _ai_help ;;
      clear|/clear|/new)
        printf '===== session cleared %s =====\n' "$(date)" >> "$_AI_HIST"
        _ai_init_thread; printf '\033[90m[memory cleared]\033[0m\n' ;;
      /save)
        local SF="$HOME/codex-$(date +%Y%m%d-%H%M%S).txt"
        cat "$_AI_HIST" > "$SF" 2>/dev/null
        printf '\033[90m✓ saved %s\033[0m\n' "$SF" ;;
      /list)
        local SL; SL=$(ls -1t "$HOME"/codex-*.txt 2>/dev/null | head -10)
        [ -n "$SL" ] && printf '%s\n' "$SL" || printf '\033[90mno saved sessions yet — /save one\033[0m\n' ;;
      /model)
        printf 'model: \033[1;37m%s\033[0m\n' "$(_ai_resolve_model)"
        printf '\033[90mpin another: echo "model-id" > ~/.ai_model · browse: ai models\033[0m\n' ;;
      *) _ai_turn "$IN" ;;
    esac
  done
  printf '\033[90mtalk soon.\033[0m\n'
}

# one entrypoint with real subcommand handling — a stray word can never
# silently become your PIN again (that was the 'ai setup not working' bug)
ai(){
  case "$1" in
    -i|--image|--media)
      shift
      local VFILE="$1"
      [ -n "$1" ] && shift
      local VPROMPT="$*"
      _ai_vision "$VFILE" "$VPROMPT"
      return $?
      ;;
    ""|start|chat|go)
      [ "$1" = "start" ] && shift
      start "$@" ;;
    setup)
      if [ -z "$2" ]; then
        printf 'usage: ai setup <your-openrouter-key>\nfree key: https://openrouter.ai/settings/keys\n'; return 1
      fi
      printf '%s' "$2" > "$_AI_KEYFILE"; chmod 600 "$_AI_KEYFILE"
      printf '\033[32m[key saved — works now, but the container wipes it on every deploy]\033[0m\n'
      printf 'to make it survive redeploys forever: set OPENROUTER_API_KEY in the Render dashboard\n'
      return 0 ;;
    models)
      local M; M=$(_ai_models | head -8)
      if [ -z "$M" ]; then printf 'could not reach openrouter — check connection\n'; return 1; fi
      printf '\033[1;37mlive free models right now (auto-ranked, tried in this order):\033[0m\n'
      printf '%s\n' "$M"
      printf '\033[90myou can pin one: echo "model-id" > ~/.ai_model\033[0m\n' ;;
    help|-h|--help)
      printf '  ai                 open the codex-style chat (streams live)\n'
      printf '  ai setup <key>     save your openrouter key (free: openrouter.ai/settings/keys)\n'
      printf '  ai models          list the live free models (uncensored first)\n'
      printf '  in-chat: /new /save /list /model /history /help\n'
      printf '  ai <4-digits>      set/unlock a pin (optional)\n' ;;
    *)
      if [ -n "${1//[0-9]/}" ]; then
        printf '\033[31munknown: ai %s\033[0m — try: ai · ai setup <key> · ai models · ai help\n' "$1"
        return 1
      fi
      start "$1" ;;
  esac
}
aichat(){ start; }
aiagent(){ start; }

history(){
  if [ "$1" = "clear" ]; then rm -f "$_AI_HIST"; echo "[history cleared]"; return; fi
  if [ ! -s "$_AI_HIST" ]; then echo "[no history yet — just say: start]"; return; fi
  printf '\033[90m── history (last %s lines) ──\033[0m\n' "${1:-60}"
  tail -n "${1:-60}" "$_AI_HIST"
}
