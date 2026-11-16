/**
 * Subjects ("Fächer", D27, pure): a subject is a to-do category with group "schule". The sheet tab
 * `faecher` adds keywords, basic info, links and notes per subject. Calendar entries get a subject
 * from an explicit tag (entries created by Cockpit) or from the keywords in their title.
 */

var SUBJECT_COLUMNS = ["id", "stichworte", "info", "links", "notizen", "updatedAt"];
var SUBJECT_LIMITS = { info: 2000, notes: 20000, links: 20, linkLabel: 60, linkUrl: 500, keywords: 12, keyword: 40 };
var SUBJECT_PATCH_FIELDS = ["keywords", "info", "links", "notes"];

/** FNV-1a (32 bit) over UTF-16 code units as 8 hex digits; the PWA uses the same function. */
function textHash(s) {
  var h = 0x811c9dc5;
  var str = String(s || "");
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

/** "Mathe, Analysis" -> ["Mathe", "Analysis"] (trimmed, deduplicated, bounded). */
function parseKeywords(cell) {
  var seen = {};
  return String(cell || "")
    .split(/[,;\n]/)
    .map(function (s) {
      return s.trim().slice(0, SUBJECT_LIMITS.keyword);
    })
    .filter(function (s) {
      var k = s.toLowerCase();
      if (!s || seen[k]) return false;
      seen[k] = true;
      return true;
    })
    .slice(0, SUBJECT_LIMITS.keywords);
}

function validLinkUrl_(u) {
  return typeof u === "string" && u.length <= SUBJECT_LIMITS.linkUrl && /^https?:\/\/[^\s<>"]+$/i.test(u);
}

/** Label shown for a link without one: the host name. */
function linkHost_(url) {
  var m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1].replace(/^www\./i, "") : url;
}

/**
 * Sheet cell with one link per line, "Label | https://…" or just the URL -> [{label, url}].
 * Readable and editable directly in the sheet; invalid lines are skipped.
 */
function parseLinks(cell) {
  var out = [];
  String(cell || "")
    .split("\n")
    .forEach(function (line) {
      var t = line.trim();
      if (!t || out.length >= SUBJECT_LIMITS.links) return;
      var bar = t.lastIndexOf("|");
      var label = bar >= 0 ? t.slice(0, bar).trim() : "";
      var url = (bar >= 0 ? t.slice(bar + 1) : t).trim();
      if (!validLinkUrl_(url)) return;
      out.push({ label: (label || linkHost_(url)).slice(0, SUBJECT_LIMITS.linkLabel), url: url });
    });
  return out;
}

function linksToCell(links) {
  return (links || [])
    .map(function (l) {
      return l.label.replace(/\|/g, "/") + " | " + l.url;
    })
    .join("\n");
}

/** Sheet row -> stored record {id, keywords, info, links, notes, updatedAt}. */
function rowToSubjectRecord(row) {
  return {
    id: String(row[0] || "").trim(),
    keywords: parseKeywords(row[1]),
    info: String(row[2] == null ? "" : row[2]),
    links: parseLinks(row[3]),
    notes: String(row[4] == null ? "" : row[4]),
    updatedAt: normalizeDateCell(row[5], false) || null,
  };
}

function subjectRecordToRow(rec) {
  return [rec.id, rec.keywords.join(", "), rec.info, linksToCell(rec.links), rec.notes, rec.updatedAt || ""];
}

/** One Subject per school category (category order), merged with its stored record. */
function subjectsForState(categories, records) {
  var byId = {};
  (records || []).forEach(function (r) {
    if (r.id) byId[r.id] = r;
  });
  return (categories || [])
    .filter(function (c) {
      return c.group === "schule";
    })
    .map(function (c) {
      var r = byId[c.id];
      return {
        id: c.id,
        keywords: r ? r.keywords : [],
        info: r ? r.info : "",
        links: r ? r.links : [],
        notes: r ? r.notes : "",
        updatedAt: r ? r.updatedAt : null,
      };
    });
}

function escapeRegex_(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Subject id for a text (event or to-do title), or "". A keyword matches at the start of a word,
 * case-insensitive ("Mathe" matches "Mathematik 2", not "Arithmetik"). Without own keywords the
 * category label counts. The longest matching keyword wins.
 * matchers: [{id, label, keywords}]
 */
function matchSubject(text, matchers) {
  var t = String(text || "").toLowerCase();
  if (!t) return "";
  var best = "";
  var bestLen = 0;
  (matchers || []).forEach(function (m) {
    var words = m.keywords && m.keywords.length ? m.keywords : [m.label];
    words.forEach(function (w) {
      var k = String(w || "").trim().toLowerCase();
      if (k.length < 2 || k.length <= bestLen) return;
      if (new RegExp("(^|[^a-z0-9äöüàéèß])" + escapeRegex_(k)).test(t)) {
        best = m.id;
        bestLen = k.length;
      }
    });
  });
  return best;
}

/** [{id, label, keywords}] for matchSubject from categories and stored records. */
function subjectMatchers(categories, records) {
  var labels = {};
  (categories || []).forEach(function (c) {
    labels[c.id] = c.label;
  });
  return subjectsForState(categories, records).map(function (s) {
    return { id: s.id, label: labels[s.id], keywords: s.keywords };
  });
}

/**
 * Sets `subject` on events: a valid explicit tag (event.subject from the calendar layer) wins,
 * else keyword matching on the title. Unknown ids are dropped. Returns new event objects.
 */
function assignEventSubjects(events, matchers, chosen) {
  var valid = {};
  (matchers || []).forEach(function (m) {
    valid[m.id] = true;
  });
  return (events || []).map(function (e) {
    var out = Object.assign({}, e);
    // D28: a subject chosen by hand (per iCalUID, `chosen` from the tab termin_faecher) wins.
    var pick = chosen ? chosen[eventKey(e.id)] : "";
    if (pick === NO_SUBJECT) {
      delete out.subject;
      return out;
    }
    var id = pick && valid[pick] ? pick : e.subject && valid[e.subject] ? e.subject : matchSubject(e.title, matchers);
    if (id) out.subject = id;
    else delete out.subject;
    return out;
  });
}

function checkLongText_(v, field, max) {
  if (v === undefined) return null;
  if (typeof v !== "string") return field + " must be a string";
  return v.length > max ? field + " is longer than " + max + " characters" : null;
}

/**
 * subject.update {id, patch: {keywords?, info?, links?, notes?}, base?: {info?, notes?}}
 * base = textHash of the text the edit started from (conflict detection, see applySubjectPatch).
 */
function validateSubjectUpdate(p) {
  if (!isPlainObject(p)) return fail_("payload must be an object");
  if (typeof p.id !== "string" || !ID_PATTERN.test(p.id)) return fail_("id is invalid");
  var patch = p.patch;
  if (!isPlainObject(patch)) return fail_("patch must be an object");
  var keys = Object.keys(patch);
  if (!keys.length) return fail_("patch is empty");
  for (var i = 0; i < keys.length; i++) {
    if (SUBJECT_PATCH_FIELDS.indexOf(keys[i]) < 0) return fail_("patch field not allowed: " + keys[i]);
  }
  var err = checkLongText_(patch.info, "info", SUBJECT_LIMITS.info) || checkLongText_(patch.notes, "notes", SUBJECT_LIMITS.notes);
  if (err) return fail_(err);
  if (patch.keywords !== undefined) {
    if (!Array.isArray(patch.keywords) || patch.keywords.length > SUBJECT_LIMITS.keywords) return fail_("keywords must be an array of at most 12");
    for (var k = 0; k < patch.keywords.length; k++) {
      var w = patch.keywords[k];
      if (typeof w !== "string" || w.length > SUBJECT_LIMITS.keyword || /[,;\n]/.test(w)) return fail_("keyword is invalid");
    }
  }
  if (patch.links !== undefined) {
    if (!Array.isArray(patch.links) || patch.links.length > SUBJECT_LIMITS.links) return fail_("links must be an array of at most 20");
    for (var j = 0; j < patch.links.length; j++) {
      var l = patch.links[j];
      if (!isPlainObject(l) || typeof l.label !== "string" || l.label.length > SUBJECT_LIMITS.linkLabel || /\n/.test(l.label)) {
        return fail_("link label is invalid");
      }
      if (!validLinkUrl_(l.url)) return fail_("link url must start with http:// or https://");
    }
  }
  if (p.base !== undefined) {
    if (!isPlainObject(p.base)) return fail_("base must be an object");
    var bk = Object.keys(p.base);
    for (var b = 0; b < bk.length; b++) {
      if ((bk[b] !== "info" && bk[b] !== "notes") || !/^[0-9a-f]{8}$/.test(p.base[bk[b]])) return fail_("base is invalid");
    }
  }
  return { ok: true, value: p };
}

/**
 * Applies a validated patch to a stored record (or a new one). For info and notes, `base` holds the
 * hash of the text the edit started from: if the stored text changed meanwhile (another device),
 * both versions are kept instead of silently overwriting one. Returns {record, conflict}.
 */
function applySubjectPatch(rec, payload, nowIso, stampLabel) {
  var r = rec
    ? Object.assign({}, rec)
    : { id: payload.id, keywords: [], info: "", links: [], notes: "", updatedAt: null };
  var patch = payload.patch;
  var base = payload.base || {};
  var conflict = false;
  ["info", "notes"].forEach(function (f) {
    if (patch[f] === undefined) return;
    var max = f === "info" ? SUBJECT_LIMITS.info : SUBJECT_LIMITS.notes;
    var m = mergeEdit(r[f], patch[f], base[f], stampLabel, max, false);
    r[f] = m.text;
    if (m.conflict) conflict = true;
  });
  if (patch.keywords !== undefined) r.keywords = parseKeywords(patch.keywords.join(","));
  if (patch.links !== undefined) {
    r.links = patch.links.map(function (l) {
      return { label: l.label.trim() || linkHost_(l.url), url: l.url };
    });
  }
  r.updatedAt = nowIso;
  return { record: r, conflict: conflict };
}

/** Public Subject shape of a stored record. */
function subjectFromRecord(r) {
  return { id: r.id, keywords: r.keywords, info: r.info, links: r.links, notes: r.notes, updatedAt: r.updatedAt };
}
