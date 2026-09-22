# share — publish a file or folder as a REAL public link (opens on any phone, anywhere)
share(){
  local A="http://127.0.0.1:${PORT:-8080}"
  case "$1" in
    add)
      local d="${2:-$PWD}" pw="${3:-}"
      printf '\033[1;34m[share]\033[0m publishing \033[1m%s\033[0m ...\n' "$d"
      curl -s -X POST "$A/api/share" \
        -H "x-api-key: ${TERMINAL_API_KEY}" -H "content-type: application/json" \
        --data "$(jq -nc --arg dir "$d" --arg password "$pw" '{dir:$dir,password:$password}')"
      echo
      ;;
    ls|"")
      curl -s "$A/api/share" -H "x-api-key: ${TERMINAL_API_KEY}" | jq .
      ;;
    log)
      curl -s "$A/api/share/$2/log" -H "x-api-key: ${TERMINAL_API_KEY}" | jq .
      ;;
    rm)
      curl -s -X DELETE "$A/api/share/$2" -H "x-api-key: ${TERMINAL_API_KEY}"
      echo
      ;;
    *)
      printf '\033[1;34m[share]\033[0m real public links, live visitor alerts\n'
      echo "  share add [folder|file] [password]   publish a real public link"
      echo "  share ls                               list active shares"
      echo "  share log <id>                        visitor log (real IPs)"
      echo "  share rm <id>                          stop sharing"
      ;;
  esac
}
