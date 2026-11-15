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

/** places -> hourly blocks (same order); null entries on failure. */
function fetchForecasts_(places) {
  var requests = places.map(function (p) {
    return {
      url:
        "https://api.open-meteo.com/v1/forecast?latitude=" + p.lat + "&longitude=" + p.lon +
        "&hourly=" + OPEN_METEO_HOURLY + "&timezone=Europe%2FZurich&forecast_days=2",
      muteHttpExceptions: true,
    };
  });
  var responses = UrlFetchApp.fetchAll(requests);
  return responses.map(function (res, i) {
    if (res.getResponseCode() !== 200) {
      log_("warn", "weather", "Open-Meteo HTTP " + res.getResponseCode() + " for place " + i);
      return null;
    }
    var body = JSON.parse(res.getContentText());
    return body && body.hourly ? body.hourly : null;
  });
}

/** Weather text for today's briefing; "" when disabled or on any failure (briefing goes out anyway). */
function weatherTextFor_(config, now, events) {
  if (config.weatherInBriefing === "false") return "";
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
    if (!plan.length) return "";
    var hourly = fetchForecasts_(
      plan.map(function (seg) {
        return seg.place;
      })
    );
    plan.forEach(function (seg, i) {
      seg.summary = summarizeHours(hourly[i], today, seg.from, seg.to);
    });
    return buildWeatherText(plan);
  } catch (e) {
    log_("warn", "weather", "weather skipped: " + e);
    return "";
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
  var p = props_();
  var url = p.getProperty("WEB_APP_URL");
  if (!url) throw new Error("WEB_APP_URL missing: run setup() first");
  var text = '{"key":"' + p.getProperty("API_KEY") + '","action":"location.update","payload":' +
    '{"lat":"LAT","lon":"LON","name":"ORT"}}';
  withWriteLock_(function () {
    setConfigValue_("shortcutUrl", url);
    setConfigValue_("shortcutText", text);
  });
  console.log("Rows shortcutUrl and shortcutText written to tab config.");
}
