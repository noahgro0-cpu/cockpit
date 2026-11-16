/** Weather for the briefing (Open-Meteo, no key) and the location reported by the iOS shortcut. */

var LOCATION_PROP = "LOCATION";
var OPEN_METEO_HOURLY =
  "temperature_2m,apparent_temperature,precipitation_probability,precipitation,snowfall,weather_code,wind_gusts_10m";

function readLocation_() {
  try {
    return JSON.parse(props_().getProperty(LOCATION_PROP) || "null");
  } catch (e) {
    return null;
  }
}

/** location.update: keeps only the latest coarse location; never logged with coordinates. */
function saveLocation_(v) {
  var rec = locationRecord(v, toZurichIso(new Date()));
  props_().setProperty(LOCATION_PROP, JSON.stringify(rec));
  log_("info", "location", "location updated"); // never the coordinates or the name
  return { at: rec.at };
}

/**
 * places -> hourly blocks (same order); null entries on failure. Successful forecasts are cached
 * per place and day for 6 h (CacheService; a value is ~10 KB, too big for a script property),
 * so the ticks before the briefing can collect them one by one despite HTTP 429 (shared IPs, D27).
 */
function fetchForecasts_(places, isoDate, retry) {
  var cache = CacheService.getScriptCache();
  var keys = places.map(function (p) {
    return forecastCacheKey(p, isoDate);
  });
  var hit = cache.getAll(keys);
  var out = keys.map(function (k) {
    try {
      return hit[k] ? JSON.parse(hit[k]) : null;
    } catch (e) {
      return null;
    }
  });
  function attempt() {
    var missing = [];
    out.forEach(function (h, i) {
      if (!h) missing.push(i);
    });
    if (!missing.length) return 0;
    var responses = UrlFetchApp.fetchAll(missing.map(function (i) {
      var p = places[i];
      return {
        url:
          "https://api.open-meteo.com/v1/forecast?latitude=" + p.lat + "&longitude=" + p.lon +
          "&hourly=" + OPEN_METEO_HOURLY + "&timezone=Europe%2FZurich&forecast_days=8",
        muteHttpExceptions: true,
      };
    }));
    var failed = 0;
    responses.forEach(function (res, j) {
      var i = missing[j];
      var code = res.getResponseCode();
      var body = res.getContentText();
      if (code === 200) {
        try {
          var hourly = JSON.parse(body).hourly;
          if (hourly) {
            out[i] = hourly;
            cache.put(keys[i], JSON.stringify(hourly), 21600);
            return;
          }
        } catch (e) {
          // counted as a failure below
        }
      }
      failed++;
      var why = code === 200 ? "" : openMeteoReason(body);
      log_("warn", "weather", "Open-Meteo " + (code === 200 ? "no hourly data" : "HTTP " + code) + (why ? " (" + why + ")" : "") + " for place " + i);
    });
    return failed;
  }
  if (attempt() && retry) {
    Utilities.sleep(3000); // a second request may leave through another IP
    attempt();
  }
  return out;
}

/** tick: shortly before the briefing, fill the forecast cache (no calendar read needed). */
function prefetchWeather_() {
  var config = readConfig_();
  if (config.weatherInBriefing === "false") return 0;
  var now = new Date();
  var today = toZurichDate(now);
  var at = parseHhmm(briefingTimeFor(today, config));
  if (!weatherPrefetchDue(zurichMinuteOfDay(now), at, props_().getProperty("BRIEFING_SENT") === today)) return 0;
  var places = prefetchPlaces(placesFromConfig(config), freshLocation(readLocation_(), now.getTime()));
  if (!places.length) return 0;
  try {
    return fetchForecasts_(places, today, false).filter(Boolean).length;
  } catch (e) {
    // A network exception here must not count as a failed tick (3 in a row = outage push).
    log_("warn", "weather", "prefetch failed: " + e);
    return 0;
  }
}

/**
 * Weather for the briefing of `now`: {text, missing}. text = "" when disabled or nothing is
 * planned; missing = a forecast could not be fetched (the briefing may then wait, see runBriefing_).
 */
function weatherFor_(config, now, events) {
  if (config.weatherInBriefing === "false") return { text: "", missing: false };
  try {
    var today = toZurichDate(now);
    var places = placesFromConfig(config);
    var plan = weatherPlan({
      lectures: lecturesOn(events, today),
      home: places.home,
      campus: places.campus,
      here: freshLocation(readLocation_(), now.getTime()),
      nowMinute: zurichMinuteOfDay(now),
    });
    if (!plan.length) return { text: "", missing: false };
    var hourly = fetchForecasts_(
      plan.map(function (seg) {
        return seg.place;
      }),
      today,
      true
    );
    plan.forEach(function (seg, i) {
      seg.summary = summarizeHours(hourly[i], today, seg.from, seg.to);
    });
    var missing = hourly.some(function (h) {
      return !h;
    });
    return { text: buildWeatherText(plan), missing: missing };
  } catch (e) {
    log_("warn", "weather", "weather skipped: " + e);
    return { text: "", missing: true };
  }
}

/** Editor helper: logs today's briefing text without sending or storing it. */
function previewBriefing() {
  console.log(briefingTextNow_(new Date()));
}

/**
 * Editor helper for the iOS shortcut: writes the web-app URL and the request text into the
 * tab `config` (rows shortcutUrl / shortcutText), so they can be copied in the Google Sheets app.
 * The sheet already holds the key inside setupCode, so this adds no new exposure.
 * Delete both rows after setting up the shortcut.
 */
function shortcutSetup() {
  withWriteLock_(writeShortcutRows_);
  console.log("Rows shortcutUrl and shortcutText written to tab config.");
}

/** Writes the rows (caller holds the write lock). Also run once automatically by tick (SHORTCUT_ROWS). */
function writeShortcutRows_() {
  var p = props_();
  var url = p.getProperty("WEB_APP_URL");
  if (!url) throw new Error("WEB_APP_URL missing: run setup() first");
  var text = '{"key":"' + p.getProperty("API_KEY") + '","action":"location.update","payload":' +
    '{"lat":"LAT","lon":"LON","name":"ORT"}}';
  setConfigValue_("shortcutUrl", url);
  setConfigValue_("shortcutText", text);
  p.setProperty("SHORTCUT_ROWS", "1");
}
