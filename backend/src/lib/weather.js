/**
 * Weather part of the briefing (pure): where the user is when, forecast summary per segment,
 * and a rule-based clothing recommendation. Forecast data: Open-Meteo hourly, local Zurich time.
 */

var LOCATION_MAX_AGE_MS = 12 * 3600 * 1000;
var NEAR_KM = 5;

function distanceKm(a, b) {
  var R = 6371;
  var rad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * rad;
  var dLon = (b.lon - a.lon) * rad;
  var h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function validPlace_(p) {
  return !!p && typeof p.lat === "number" && typeof p.lon === "number" && isFinite(p.lat) && isFinite(p.lon);
}

/** Config -> {home, campus} places (null when coordinates are missing). */
function placesFromConfig(config) {
  function place(lat, lon, name, fallbackWhere) {
    var la = parseFloat(lat);
    var lo = parseFloat(lon);
    if (!isFinite(la) || !isFinite(lo)) return null;
    var n = String(name || "").trim();
    return { lat: la, lon: lo, name: n, where: n ? "in " + n : fallbackWhere };
  }
  return {
    home: place(config.lat, config.lon, config.homeName, "zu Hause"),
    campus: place(config.campusLat, config.campusLon, config.campusName, "an der Schule"),
  };
}

/** Validates a `location.update` payload {lat, lon, name?}. */
function validateLocationUpdate(p) {
  if (!isPlainObject(p)) return { ok: false, message: "payload must be an object" };
  var lat = typeof p.lat === "string" ? parseFloat(p.lat.replace(",", ".")) : p.lat;
  var lon = typeof p.lon === "string" ? parseFloat(p.lon.replace(",", ".")) : p.lon;
  if (typeof lat !== "number" || !isFinite(lat) || lat < -90 || lat > 90) return { ok: false, message: "lat is invalid" };
  if (typeof lon !== "number" || !isFinite(lon) || lon < -180 || lon > 180) return { ok: false, message: "lon is invalid" };
  if (p.name !== undefined && p.name !== null && typeof p.name !== "string") return { ok: false, message: "name must be a string" };
  return { ok: true, value: { lat: lat, lon: lon, name: p.name || "" } };
}

/** Stored form: rounded to ~1 km, name cleaned and capped. */
function locationRecord(v, nowIso) {
  var name = String(v.name || "")
    .replace(/[\u0000-\u001f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return { lat: Math.round(v.lat * 100) / 100, lon: Math.round(v.lon * 100) / 100, name: name, at: nowIso };
}

/** The reported location if it is fresh, else null. */
function freshLocation(record, nowMs) {
  if (!record || !validPlace_(record)) return null;
  var at = Date.parse(record.at);
  if (!isFinite(at) || nowMs - at > LOCATION_MAX_AGE_MS || at - nowMs > 3600 * 1000) return null;
  return { lat: record.lat, lon: record.lon, name: record.name, where: record.name ? "in " + record.name : "an deinem Standort" };
}

function minuteOfIso_(iso) {
  return zurichMinuteOfDay(new Date(Date.parse(iso)));
}

/**
 * Plans the weather segments for a day.
 * input: {lectures: [{start, end}] (today, sorted), home, campus, here (fresh location or null),
 *         nowMinute (optional: a day without lectures starts at the current hour)}
 * -> [{place, from, to, kind}] with minutes of the Zurich day; kind = "way" | "campus" | "day".
 */
function weatherPlan(input) {
  var home = validPlace_(input.home) ? input.home : null;
  var here = validPlace_(input.here) ? input.here : null;
  var start = here && (!home || distanceKm(here, home) > NEAR_KM) ? here : home;
  if (!start) return [];
  var lectures = input.lectures || [];
  var campus = validPlace_(input.campus) ? input.campus : null;
  if (!lectures.length || !campus) {
    var dayFrom = Math.max(7 * 60, Math.floor((input.nowMinute || 0) / 60) * 60);
    return [{ place: start, from: Math.min(dayFrom, 20 * 60), to: 21 * 60, kind: "day" }];
  }
  var first = minuteOfIso_(lectures[0].start);
  var last = Math.max.apply(
    null,
    lectures.map(function (l) {
      return minuteOfIso_(l.end);
    })
  );
  if (last < first + 60) last = first + 60;
  var wayFrom = Math.max(first - 120, 5 * 60);
  var wayTo = Math.max(first - 30, wayFrom + 60);
  if (distanceKm(start, campus) <= NEAR_KM) {
    return [{ place: campus, from: wayFrom, to: last, kind: "campus" }];
  }
  return [
    { place: start, from: wayFrom, to: wayTo, kind: "way" },
    { place: campus, from: first, to: last, kind: "campus" },
  ];
}

/**
 * Open-Meteo hourly block -> summary for [from, to] minutes on isoDate, or null without data.
 * hourly: {time: ["YYYY-MM-DDTHH:MM"], temperature_2m, apparent_temperature,
 *          precipitation_probability, precipitation, snowfall, weather_code, wind_gusts_10m}
 */
function summarizeHours(hourly, isoDate, from, to) {
  if (!hourly || !Array.isArray(hourly.time)) return null;
  var s = null;
  function num(arr, i) {
    var v = arr ? arr[i] : null;
    return typeof v === "number" && isFinite(v) ? v : null;
  }
  for (var i = 0; i < hourly.time.length; i++) {
    var t = String(hourly.time[i]);
    if (t.slice(0, 10) !== isoDate) continue;
    var m = parseInt(t.slice(11, 13), 10) * 60 + parseInt(t.slice(14, 16), 10);
    if (m < from - 59 || m > to) continue; // the hour that contains `from` counts
    var temp = num(hourly.temperature_2m, i);
    if (temp === null) continue;
    var feels = num(hourly.apparent_temperature, i);
    var prob = num(hourly.precipitation_probability, i) || 0;
    var code = num(hourly.weather_code, i) || 0;
    if (!s) s = { tMin: temp, tMax: temp, feelsMin: feels === null ? temp : feels, pMax: 0, pMaxAt: m, pSum: 0, gustMax: 0, snow: false, thunder: false };
    s.tMin = Math.min(s.tMin, temp);
    s.tMax = Math.max(s.tMax, temp);
    if (feels !== null) s.feelsMin = Math.min(s.feelsMin, feels);
    if (prob > s.pMax) {
      s.pMax = prob;
      s.pMaxAt = m;
    }
    s.pSum += num(hourly.precipitation, i) || 0;
    s.gustMax = Math.max(s.gustMax, num(hourly.wind_gusts_10m, i) || 0);
    if ((num(hourly.snowfall, i) || 0) > 0 || (code >= 71 && code <= 77) || code === 85 || code === 86) s.snow = true;
    if (code >= 95) s.thunder = true;
  }
  return s;
}

/** Temperature class by the lowest felt temperature (highest temperature for "heiss"). */
function tempClass(s) {
  if (s.tMax >= 28) return "heiss";
  var f = s.feelsMin;
  if (f <= -5) return "sehr kalt";
  if (f <= 3) return "kalt";
  if (f <= 9) return "kühl";
  if (f <= 15) return "frisch";
  if (f <= 23) return "mild";
  return "warm";
}

function clothingAdvice(cls, s) {
  switch (cls) {
    case "sehr kalt":
      return "zieh dich warm an: warme Jacke, Mütze und Handschuhe";
    case "kalt":
      return s.feelsMin <= 0 ? "nimm eine warme Jacke und eine Mütze mit" : "nimm eine warme Jacke mit";
    case "kühl":
      return "nimm sicher eine Jacke mit";
    case "frisch":
      return "eine leichte Jacke oder ein Pulli reicht";
    case "mild":
      return "eine Jacke brauchst du kaum";
    case "warm":
      return "leichte Kleidung reicht";
    default:
      return "leichte Kleidung und genug Wasser";
  }
}

function timeWord(minute) {
  if (minute < 10 * 60) return "am Morgen";
  if (minute < 12 * 60) return "am Vormittag";
  if (minute < 14 * 60) return "über Mittag";
  if (minute < 18 * 60) return "am Nachmittag";
  return "am Abend";
}

function segmentTimeWord_(seg) {
  if (seg.kind === "day") return "heute";
  if (seg.from < 12 * 60 && seg.to > 14 * 60) return "tagsüber";
  return timeWord((seg.from + seg.to) / 2);
}

function cap_(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tempText_(s) {
  var lo = Math.round(s.tMin);
  var hi = Math.round(s.tMax);
  var t = lo === hi ? lo + " °C" : lo + " bis " + hi + " °C";
  var f = Math.round(s.feelsMin);
  if (f <= lo - 3) t += ", gefühlt " + f + " °C";
  return t;
}

/** Precipitation clause or "" (dry). Mentions the peak time on long segments. */
function rainAdvice(s, longSegment) {
  var when = longSegment ? ", vor allem " + timeWord(s.pMaxAt) : "";
  var p = Math.round(s.pMax);
  if (s.thunder) return "Gewitter möglich (" + p + " %" + when + "), nimm einen Regenschirm mit";
  if (s.snow && (s.pMax >= 30 || s.pSum >= 0.3)) return "es könnte schneien (" + p + " %" + when + "), denk an gute Schuhe";
  if (s.pMax >= 60 || s.pSum >= 2) return "es regnet wahrscheinlich (" + p + " %" + when + "), nimm einen Regenschirm mit";
  if (s.pMax >= 30 || s.pSum >= 0.3) {
    return "es könnte leicht regnen (" + p + " %" + when + "), wenn du noch Platz hast, nimm für alle Fälle einen Schirm mit";
  }
  return "";
}

/**
 * Weather text for the briefing. segments: [{place, from, to, kind, summary}] (summary may be null).
 * Returns "" when there is nothing usable.
 */
function buildWeatherText(segments) {
  var out = [];
  var prevClass = null;
  segments.forEach(function (seg) {
    var s = seg.summary;
    if (!s) return;
    var cls = tempClass(s);
    var head = cap_(segmentTimeWord_(seg)) + " " + (seg.place.where || "in " + seg.place.name);
    var sentence;
    if (cls === prevClass) {
      sentence = head + " ist es ähnlich (" + tempText_(s) + ").";
    } else {
      sentence = head + " ist es " + cls + " (" + tempText_(s) + "), " + clothingAdvice(cls, s) + ".";
    }
    var rain = rainAdvice(s, seg.to - seg.from > 4 * 60);
    if (rain) sentence += " " + cap_(rain) + ".";
    if (s.gustMax >= 50) sentence += " Windig, Böen bis " + Math.round(s.gustMax) + " km/h.";
    out.push(sentence);
    prevClass = cls;
  });
  return out.join(" ");
}

/** Today's timed lectures, sorted by start. */
function lecturesOn(events, isoDate) {
  return (events || [])
    .filter(function (e) {
      return e.kind === "lecture" && !e.allDay && toZurichDate(new Date(Date.parse(e.start))) === isoDate;
    })
    .sort(function (a, b) {
      return Date.parse(a.start) - Date.parse(b.start);
    });
}
