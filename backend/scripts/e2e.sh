#!/usr/bin/env bash
# Acceptance test against the live web app (SPEC §6 phase 1a). Reads backend/.env.local
# (WEB_APP_URL, API_KEY); never prints the key. Creates one all-day test event in the exams calendar.
set -u
cd "$(dirname "$0")/.."
URL=$(grep '^WEB_APP_URL=' .env.local | cut -d= -f2- | tr -d '\r')
KEY=$(grep '^API_KEY=' .env.local | cut -d= -f2- | tr -d '\r')
ID=$(node -e 'console.log(crypto.randomUUID())')
PASS=0; FAIL=0

post() { printf '%s' "$1" | curl -sL --max-time 60 -H 'Content-Type: text/plain;charset=utf-8' --data-binary @- "$URL"; }
req() { printf '{"key":"%s","action":"%s","payload":%s}' "$KEY" "$1" "${2:-{\}}"; }
# check <label> <response> <node expression on r>
check() {
  if R="$2" node -e "const r=JSON.parse(process.env.R); if(!($3)) process.exit(1)" 2>/dev/null; then
    PASS=$((PASS+1)); echo "ok   $1"
  else
    FAIL=$((FAIL+1)); echo "FAIL $1 -> $(echo "$2" | head -c 300)"
  fi
}

T0=$(date +%s%3N); r=$(post "$(req ping)"); T1=$(date +%s%3N)
check "ping ($((T1-T0)) ms)" "$r" 'r.ok && /T\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(r.data.time)'
check "wrong key -> unauthorized" "$(post '{"key":"wrong","action":"ping"}')" '!r.ok && r.error.code==="unauthorized"'
check "broken JSON -> bad_request" "$(post '{"key": oops')" '!r.ok && r.error.code==="bad_request"'
check "unknown action -> bad_request" "$(post "$(req nope)")" '!r.ok && r.error.code==="bad_request"'
check "invalid payload -> bad_request" "$(post "$(req todo.add '{"id":"x y","title":""}')")" '!r.ok && r.error.code==="bad_request"'
check "GET -> JSON bad_request" "$(curl -sL --max-time 60 "$URL")" '!r.ok && r.error.code==="bad_request"'

ADD=$(printf '{"id":"%s","title":"Cockpit-Test Ümlaut","due":"2026-11-20","priority":1}' "$ID")
check "todo.add" "$(post "$(req todo.add "$ADD")")" 'r.ok && r.data.title==="Cockpit-Test Ümlaut" && r.data.due==="2026-11-20" && r.data.dueHasTime===false && r.data.status==="open"'
check "todo.add again is idempotent" "$(post "$(req todo.add "$ADD")")" 'r.ok && r.data.priority===1'
check "todo.update (time + clear priority)" "$(post "$(req todo.update "{\"id\":\"$ID\",\"patch\":{\"due\":\"2026-11-21T09:30:00+01:00\",\"notes\":\"n\"}}")")" 'r.ok && r.data.due==="2026-11-21T09:30:00+01:00" && r.data.dueHasTime===true && r.data.notes==="n"'
check "todo.complete done" "$(post "$(req todo.complete "{\"id\":\"$ID\",\"done\":true}")")" 'r.ok && r.data.status==="done" && !!r.data.doneAt'
check "getState contains done todo (cache invalidated)" "$(post "$(req getState)")" "r.ok && r.data.todos.some(t=>t.id==='$ID' && t.status==='done')"
check "todo.complete reopen" "$(post "$(req todo.complete "{\"id\":\"$ID\",\"done\":false}")")" 'r.ok && r.data.status==="open" && r.data.doneAt===undefined'
check "todo.update unknown -> not_found" "$(post "$(req todo.update '{"id":"does-not-exist","patch":{"title":"x"}}')")" '!r.ok && r.error.code==="not_found"'
check "todo.delete" "$(post "$(req todo.delete "{\"id\":\"$ID\"}")")" "r.ok && r.data.id==='$ID'"
check "todo.delete again is idempotent" "$(post "$(req todo.delete "{\"id\":\"$ID\"}")")" 'r.ok'

EV='{"calendar":"exams","title":"Cockpit-Test Pruefung (bitte loeschen)","date":"2027-01-08","kind":"exam"}'
check "event.add" "$(post "$(req event.add "$EV")")" 'r.ok && r.data.kind==="exam" && r.data.allDay && r.data.start==="2027-01-08" && r.data.end==="2027-01-09"'
check "event.add again is idempotent" "$(post "$(req event.add "$EV")")" 'r.ok'

S=$(post "$(req getState)")
[ -n "${STATE_OUT:-}" ] && echo "$S" > "$STATE_OUT"
check "getState: schema, health, settings" "$S" 'r.ok && r.data.schema===1 && /^(observe|active)$/.test(r.data.health.mode) && r.data.settings.categories.length>0'
check "getState: lectures in next 21 days" "$S" 'r.data.events.some(e=>e.kind==="lecture")'
check "getState: exams contain test event once" "$S" 'r.data.exams.filter(e=>e.title.startsWith("Cockpit-Test")).length===1'
check "getState: no todo left over" "$S" "!r.data.todos.some(t=>t.id==='$ID')"
# D27 subjects: validation, and a round trip of text that looks like a formula/date on a subject
# whose notes are empty (restored to empty afterwards). Skipped when every subject has notes.
check "getState: subjects" "$S" "Array.isArray(r.data.subjects) && r.data.subjects.every(x=>typeof x.notes===\"string\")"
check "subject.update unknown -> not_found" "$(post "$(req subject.update '{"id":"does-not-exist","patch":{"notes":"x"}}')")" '!r.ok && r.error.code==="not_found"'
check "subject.update javascript link -> bad_request" "$(post "$(req subject.update '{"id":"x","patch":{"links":[{"label":"x","url":"javascript:alert(1)"}]}}')")" '!r.ok && r.error.code==="bad_request"'
SID=$(R="$S" node -e "const s=(JSON.parse(process.env.R).data.subjects||[]).find(x=>!x.notes&&!x.info);console.log(s?s.id:\"\")")
if [ -n "$SID" ]; then
  NOTE='"=1+1\n- 2026-11-20\n+41 Test"'   # JSON string literal
  UP=$(printf '{"id":"%s","patch":{"notes":%s},"base":{"notes":"811c9dc5"}}' "$SID" "$NOTE")
  check "subject.update keeps formula-like text" "$(post "$(req subject.update "$UP")")" "r.ok && r.data.notes===$NOTE"
  check "getState shows the note as text" "$(post "$(req getState)")" "r.ok && r.data.subjects.find(x=>x.id==='$SID').notes===$NOTE"
  check "subject.update restores empty note" "$(post "$(req subject.update "{\"id\":\"$SID\",\"patch\":{\"notes\":\"\"}}")")" 'r.ok && r.data.notes===""'
else
  echo "skip subject round trip (all subjects have notes)"
fi

check "getWidget" "$(post "$(req getWidget)")" 'r.ok && r.data.schema===1 && Array.isArray(r.data.today) && r.data.todos.length<=5'

# CORS: the final response must allow any origin, so a browser can read it without preflight.
H=$(curl -sL --max-time 60 -D - -o /dev/null -H 'Origin: https://example.github.io' -H 'Content-Type: text/plain;charset=utf-8' --data "$(req ping)" "$URL" | tr -d '\r' | grep -i '^access-control-allow-origin' | tail -1)
if [ -n "$H" ]; then PASS=$((PASS+1)); echo "ok   CORS header: $H"; else FAIL=$((FAIL+1)); echo "FAIL no Access-Control-Allow-Origin"; fi

echo "== $PASS passed, $FAIL failed"
