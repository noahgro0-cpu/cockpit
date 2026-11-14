#!/usr/bin/env bash
# Prints backend health and counts (no personal content, no key). Reads backend/.env.local.
cd "$(dirname "$0")/.."
URL=$(grep '^WEB_APP_URL=' .env.local | cut -d= -f2- | tr -d '\r')
KEY=$(grep '^API_KEY=' .env.local | cut -d= -f2- | tr -d '\r')
printf '{"key":"%s","action":"getState"}' "$KEY" | curl -sL --max-time 60 -H 'Content-Type: text/plain;charset=utf-8' --data-binary @- "$URL" |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(!r.ok){console.log(r.error);return}
  const d=r.data;console.log("health", JSON.stringify(d.health));
  console.log("mails", d.mails.length, "by", JSON.stringify(d.mails.reduce((a,m)=>(a[m.classifiedBy+"/"+m.importance]=(a[m.classifiedBy+"/"+m.importance]||0)+1,a),{})),
    "sensitive", d.mails.filter(m=>m.sensitive).length, "withTodo", d.mails.filter(m=>m.todoId).length);
  console.log("todos open", d.todos.filter(t=>t.status==="open").length, "fromMail", d.todos.filter(t=>t.source==="mail").length);
  console.log("briefing", d.briefing ? d.briefing.date : null);})'
