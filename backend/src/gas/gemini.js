/**
 * Gemini generateContent call (DECISIONS.md D3/D4). Only this file talks to the AI.
 * Updates the AI_STATUS property: "ok" after a success, "limited" after any failure.
 */

function aiAvailable_(config) {
  return config.aiEnabled === "true" && !!props_().getProperty("GEMINI_API_KEY");
}

/** Returns {ok:true, text} or {ok:false, status, reason}. Never throws. */
function callGemini_(body, config) {
  var key = props_().getProperty("GEMINI_API_KEY");
  if (!key) return { ok: false, status: 0, reason: "no key" };
  var model = String(config.aiModel || CONFIG_DEFAULTS.aiModel).replace(/[^A-Za-z0-9.\-_]/g, "");
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
  var result;
  try {
    var res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": key },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    var status = res.getResponseCode();
    if (status !== 200) {
      var reason = status === 429 ? "rate limited" : status === 404 ? "model not found: " + model : "HTTP " + status;
      result = { ok: false, status: status, reason: reason };
    } else {
      var parsed = geminiResponseText(JSON.parse(res.getContentText()));
      result = parsed.ok ? { ok: true, text: parsed.text } : { ok: false, status: 200, reason: parsed.reason };
    }
  } catch (e) {
    result = { ok: false, status: 0, reason: "fetch failed: " + String(e).slice(0, 120) };
  }
  props_().setProperty("AI_STATUS", result.ok ? "ok" : "limited");
  if (!result.ok) log_("warn", "ai", "Gemini call failed: " + result.reason);
  return result;
}
