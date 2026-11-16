// Weather in the briefing: plan (places/times), hourly summary, clothing and rain rules, location.
// All places are invented.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load.js");
const plain = (o) => JSON.parse(JSON.stringify(o));

const HOME = { lat: 47.0, lon: 8.0, name: "Musterdorf" };
const CAMPUS = { lat: 47.3, lon: 8.4, name: "Campusstadt" };
const lecture = (start, end) => ({ kind: "lecture", allDay: false, start, end });

/** Hourly block for one day; f(hour) -> partial values. */
function hourly(date, f) {
  const h = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], snowfall: [], weather_code: [], wind_gusts_10m: [] };
  for (let i = 0; i < 24; i++) {
    const v = Object.assign({ t: 10, feels: 10, p: 0, mm: 0, snow: 0, code: 1, gust: 10 }, f(i));
    h.time.push(date + "T" + String(i).padStart(2, "0") + ":00");
    h.temperature_2m.push(v.t);
    h.apparent_temperature.push(v.feels);
    h.precipitation_probability.push(v.p);
    h.precipitation.push(v.mm);
    h.snowfall.push(v.snow);
    h.weather_code.push(v.code);
    h.wind_gusts_10m.push(v.gust);
  }
  return h;
}

test("plan: lecture day -> way at home, then campus during lectures", () => {
  const plan = L.weatherPlan({
    lectures: [lecture("2026-11-16T08:00:00+01:00", "2026-11-16T09:30:00+01:00"), lecture("2026-11-16T13:00:00+01:00", "2026-11-16T16:30:00+01:00")],
    home: HOME,
    campus: CAMPUS,
    here: null,
  });
  assert.deepEqual(plain(plan.map((s) => [s.place.name, s.from, s.to, s.kind])), [
    ["Musterdorf", 360, 450, "way"],
    ["Campusstadt", 480, 990, "campus"],
  ]);
});

test("plan: no lectures (weekend) -> one segment at home, or at a fresh far location", () => {
  assert.deepEqual(plain(L.weatherPlan({ lectures: [], home: HOME, campus: CAMPUS, here: null }).map((s) => s.place.name)), ["Musterdorf"]);
  const away = { lat: 46.5, lon: 7.5, name: "Bergdorf" };
  const plan = L.weatherPlan({ lectures: [], home: HOME, campus: CAMPUS, here: away });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].place.name, "Bergdorf");
  assert.equal(plan[0].kind, "day");
  // A location near home counts as home (keeps the configured name)
  const near = { lat: 47.01, lon: 8.01, name: "Nachbarort" };
  assert.equal(L.weatherPlan({ lectures: [], home: HOME, campus: CAMPUS, here: near })[0].place.name, "Musterdorf");
});

test("plan: day without lectures starts at the current hour", () => {
  const at = (m) => plain(L.weatherPlan({ lectures: [], home: HOME, campus: CAMPUS, nowMinute: m })[0]);
  assert.equal(at(undefined).from, 420);
  assert.equal(at(9 * 60 + 5).from, 540);
  assert.equal(at(23 * 60).from, 1200);
});

test("plan: stayed overnight near campus -> one campus segment", () => {
  const plan = L.weatherPlan({
    lectures: [lecture("2026-11-16T10:00:00+01:00", "2026-11-16T12:00:00+01:00")],
    home: HOME,
    campus: CAMPUS,
    here: { lat: 47.31, lon: 8.41, name: "Campusstadt-Süd" },
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, "campus");
});

test("plan: lecture times are Zurich wall-clock in summer and winter time", () => {
  const summer = L.weatherPlan({ lectures: [lecture("2026-07-06T08:00:00+02:00", "2026-07-06T12:00:00+02:00")], home: HOME, campus: CAMPUS });
  const winter = L.weatherPlan({ lectures: [lecture("2026-11-16T08:00:00+01:00", "2026-11-16T12:00:00+01:00")], home: HOME, campus: CAMPUS });
  assert.deepEqual(plain(summer.map((s) => [s.from, s.to])), plain(winter.map((s) => [s.from, s.to])));
  // DST change day (29.3.2026): 08:00 CEST is still minute 480
  const dst = L.weatherPlan({ lectures: [lecture("2026-03-29T08:00:00+02:00", "2026-03-29T10:00:00+02:00")], home: HOME, campus: CAMPUS });
  assert.equal(dst[1].from, 480);
});

test("plan: missing home coordinates -> no weather", () => {
  assert.deepEqual(plain(L.weatherPlan({ lectures: [], home: null, campus: CAMPUS })), []);
  const places = L.placesFromConfig({ lat: "", lon: "", campusLat: "47.3", campusLon: "8.4", campusName: "" });
  assert.equal(places.home, null);
  assert.equal(places.campus.where, "an der Schule");
  const t = L.buildWeatherText([{ place: places.campus, from: 420, to: 480, kind: "day", summary: { tMin: 20, tMax: 20, feelsMin: 20, pMax: 0, pSum: 0, gustMax: 0 } }]);
  assert.equal(t, "Heute an der Schule ist es mild (20 °C), eine Jacke brauchst du kaum.");
});

test("summarizeHours uses only the window of the given date", () => {
  const h = hourly("2026-11-16", (i) => ({ t: i, feels: i - 2, p: i === 15 ? 70 : 0 }));
  const s = L.summarizeHours(h, "2026-11-16", 6 * 60, 9 * 60);
  assert.equal(s.tMin, 6);
  assert.equal(s.tMax, 9);
  assert.equal(s.feelsMin, 4);
  assert.equal(s.pMax, 0);
  assert.equal(L.summarizeHours(h, "2026-11-17", 0, 1440), null);
  assert.equal(L.summarizeHours(null, "2026-11-16", 0, 1440), null);
});

test("weekday text: cool morning at home, light rain at campus in the afternoon", () => {
  const morning = L.summarizeHours(hourly("2026-11-16", () => ({ t: 5, feels: 2 })), "2026-11-16", 360, 450);
  const afternoon = L.summarizeHours(hourly("2026-11-16", (i) => ({ t: 9, feels: 7, p: i === 15 ? 40 : 10 })), "2026-11-16", 780, 1020);
  const text = L.buildWeatherText([
    { place: HOME, from: 360, to: 450, kind: "way", summary: morning },
    { place: CAMPUS, from: 780, to: 1020, kind: "campus", summary: afternoon },
  ]);
  assert.equal(
    text,
    "Am Morgen in Musterdorf ist es kalt (5 °C, gefühlt 2 °C), nimm eine warme Jacke mit. " +
      "Am Nachmittag in Campusstadt ist es kühl (9 °C), nimm sicher eine Jacke mit. " +
      "Es könnte leicht regnen (40 %), wenn du noch Platz hast, nimm für alle Fälle einen Schirm mit."
  );
});

test("same temperature class is not repeated; long segment names the rain peak", () => {
  const s1 = L.summarizeHours(hourly("2026-11-16", () => ({ t: 6, feels: 6 })), "2026-11-16", 360, 450);
  const s2 = L.summarizeHours(hourly("2026-11-16", (i) => ({ t: 8, feels: 7, p: i === 16 ? 80 : 20 })), "2026-11-16", 480, 1020);
  const text = L.buildWeatherText([
    { place: HOME, from: 360, to: 450, kind: "way", summary: s1 },
    { place: CAMPUS, from: 480, to: 1020, kind: "campus", summary: s2 },
  ]);
  assert.match(text, /Tagsüber in Campusstadt ist es ähnlich \(8 °C\)\. Es regnet wahrscheinlich \(80 %, vor allem am Nachmittag\), nimm einen Regenschirm mit\./);
});

test("same rain level in both segments is mentioned briefly the second time", () => {
  const s1 = L.summarizeHours(hourly("2026-11-16", () => ({ t: 6, feels: 6, p: 40 })), "2026-11-16", 360, 450);
  const s2 = L.summarizeHours(hourly("2026-11-16", () => ({ t: 12, feels: 12, p: 35 })), "2026-11-16", 480, 1020);
  const text = L.buildWeatherText([
    { place: HOME, from: 360, to: 450, kind: "way", summary: s1 },
    { place: CAMPUS, from: 480, to: 1020, kind: "campus", summary: s2 },
  ]);
  assert.ok(text.includes("Es könnte leicht regnen (40 %), wenn du noch Platz hast"));
  assert.ok(text.endsWith("Tagsüber in Campusstadt ist es frisch (12 °C), eine leichte Jacke oder ein Pulli reicht. Auch dort Regen möglich (35 %)."));
});

test("weekend text: one sentence for the day", () => {
  const s = L.summarizeHours(hourly("2026-11-21", (i) => ({ t: i < 12 ? 1 : 4, feels: i < 12 ? -3 : 1, snow: i === 10 ? 0.4 : 0, p: i === 10 ? 50 : 0, gust: 55 })), "2026-11-21", 420, 1260);
  const text = L.buildWeatherText([{ place: HOME, from: 420, to: 1260, kind: "day", summary: s }]);
  assert.equal(
    text,
    "Heute in Musterdorf ist es kalt (1 bis 4 °C, gefühlt -3 °C), nimm eine warme Jacke und eine Mütze mit. " +
      "Es könnte schneien (50 %, vor allem am Vormittag), denk an gute Schuhe. Windig, Böen bis 55 km/h."
  );
});

test("clothing classes cover the range; warm and dry gives no rain sentence", () => {
  const cls = (feels, tMax) => L.tempClass({ feelsMin: feels, tMax: tMax === undefined ? feels : tMax });
  assert.deepEqual([-8, 0, 7, 12, 20, 26].map((f) => cls(f)), ["sehr kalt", "kalt", "kühl", "frisch", "mild", "warm"]);
  assert.equal(cls(20, 30), "heiss");
  const s = L.summarizeHours(hourly("2026-07-04", () => ({ t: 24, feels: 25 })), "2026-07-04", 420, 1260);
  assert.equal(L.buildWeatherText([{ place: HOME, from: 420, to: 1260, kind: "day", summary: s }]), "Heute in Musterdorf ist es warm (24 °C), leichte Kleidung reicht.");
});

test("buildWeatherText skips segments without data", () => {
  assert.equal(L.buildWeatherText([{ place: HOME, from: 0, to: 60, kind: "day", summary: null }]), "");
});

test("location.update: validation, rounding, freshness", () => {
  assert.equal(L.validateLocationUpdate({ lat: 95, lon: 8 }).ok, false);
  assert.equal(L.validateLocationUpdate({ lat: 47 }).ok, false);
  assert.equal(L.validateLocationUpdate({ lat: 47, lon: 8, name: 3 }).ok, false);
  // iOS may send numbers as strings with a decimal comma
  const v = L.validateLocationUpdate({ lat: "47,12345", lon: "8.98765", name: "  Berg\ndorf<b>  " });
  assert.equal(v.ok, true);
  const rec = L.locationRecord(v.value, "2026-11-21T07:00:00+01:00");
  assert.deepEqual(plain(rec), { lat: 47.12, lon: 8.99, name: "Berg", at: "2026-11-21T07:00:00+01:00" });
  const t = Date.parse("2026-11-21T09:00:00+01:00");
  assert.equal(L.freshLocation(rec, t).name, "Berg");
  assert.equal(L.freshLocation(rec, t + 11 * 3600 * 1000), null);
  assert.equal(L.freshLocation(null, t), null);
  assert.equal(L.freshLocation(Object.assign({}, rec, { name: "" }), t).where, "an deinem Standort");
});

test("placeName keeps only the town, never the street", () => {
  assert.equal(L.placeName("Bergdorf"), "Bergdorf");
  assert.equal(L.placeName("Musterweg 12, 9999 Bergdorf, Schweiz"), "Bergdorf");
  assert.equal(L.placeName("Musterweg 12" + String.fromCharCode(10) + "9999 Bergdorf"), "Bergdorf");
  assert.equal(L.placeName("CH-9999 Bergdorf"), "Bergdorf");
  assert.equal(L.placeName("Musterweg 12"), "");
  assert.equal(L.placeName(""), "");
});

test("briefing text puts the weather after the first line", () => {
  const text = L.buildBriefingText({ now: new Date("2026-11-21T09:00:00+01:00"), events: [], todos: [], exams: [], mails: [], weatherText: "Heute in Musterdorf ist es mild (18 °C)." });
  assert.equal(text.split("\n")[1], "Heute in Musterdorf ist es mild (18 °C).");
});

test("API accepts location.update and briefing.preview", () => {
  const actions = L.apiActions_();
  assert.ok(actions["location.update"]);
  assert.ok(actions["briefing.preview"]);
  const v = actions["briefing.preview"].validate;
  assert.equal(v(undefined).ok, true);
  assert.equal(v({ date: "2026-11-16" }).ok, true);
  assert.equal(v({ date: "16.11.2026" }).ok, false);
});

// --- D27: Open-Meteo HTTP 429 (shared Apps Script IPs): cache, prefetch, bounded hold ---

test("prefetch window: 90 min before the briefing until its time, not after sending", () => {
  const at = 390; // 06:30
  assert.equal(L.weatherPrefetchDue(299, at, false), false);
  assert.equal(L.weatherPrefetchDue(300, at, false), true);
  assert.equal(L.weatherPrefetchDue(389, at, false), true);
  assert.equal(L.weatherPrefetchDue(390, at, false), false); // the briefing itself fetches
  assert.equal(L.weatherPrefetchDue(350, at, true), false);
  assert.equal(L.weatherPrefetchDue(350, null, false), false);
});

test("briefing waits for missing weather at most 40 min, never when weather is there", () => {
  const at = 390;
  assert.equal(L.briefingWaitsForWeather(true, 398, at), true);
  assert.equal(L.briefingWaitsForWeather(true, 429, at), true);
  assert.equal(L.briefingWaitsForWeather(true, 430, at), false);
  assert.equal(L.briefingWaitsForWeather(false, 398, at), false);
});

test("forecast cache key: rounded coordinates and day; prefetch places deduplicated", () => {
  assert.equal(L.forecastCacheKey({ lat: 47.0012, lon: 8.4 }, "2026-11-16"), "wx:47.00,8.40:2026-11-16");
  const places = L.prefetchPlaces({ home: HOME, campus: CAMPUS }, { lat: 47.001, lon: 8.0, name: "x" });
  assert.deepEqual(plain(places.map((p) => p.name)), ["Musterdorf", "Campusstadt"]);
  assert.equal(L.prefetchPlaces({ home: null, campus: null }, null).length, 0);
});

test("Open-Meteo error reason is extracted for the log", () => {
  assert.equal(L.openMeteoReason('{"error":true,"reason":"Daily API request limit exceeded"}'), "Daily API request limit exceeded");
  assert.equal(L.openMeteoReason("<html>busy</html>"), "<html>busy</html>");
});
