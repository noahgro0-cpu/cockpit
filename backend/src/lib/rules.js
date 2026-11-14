/**
 * Rules from the sheet tab `regeln` and the local (pre-AI) mail classification (pure).
 * Rule row: [aktiv, feld, muster, importance, kategorie, sensibel, push, kommentar].
 */

function yesNo_(v, emptyValue) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  var s = String(v == null ? "" : v).trim().toLowerCase();
  if (s === "") return emptyValue;
  return ["ja", "j", "yes", "y", "true", "wahr", "x", "1"].indexOf(s) >= 0;
}

/** Turns a `muster` cell into a matcher; `/…/` (optional flags) is a regex, else a substring. */
function compilePattern_(muster) {
  var s = String(muster == null ? "" : muster).trim();
  if (s === "") return null;
  var m = /^\/(.+)\/([a-z]*)$/.exec(s);
  if (m) {
    var flags = m[2].replace(/[^imsu]/g, "");
    if (flags.indexOf("i") < 0) flags += "i";
    var re = new RegExp(m[1], flags); // throws on invalid regex, handled by parseRules
    return function (text) {
      return re.test(text);
    };
  }
  var needle = s.toLowerCase();
  return function (text) {
    return text.toLowerCase().indexOf(needle) >= 0;
  };
}

/** Sheet rows -> {rules, errors}. Invalid rows are skipped and reported (row numbers are 1-based sheet rows). */
function parseRules(rows, rowNums) {
  var rules = [];
  var errors = [];
  (rows || []).forEach(function (r, i) {
    var sheetRow = rowNums ? rowNums[i] : i + 2;
    if (!yesNo_(r[0], true)) return;
    var feld = String(r[1] || "").trim().toLowerCase();
    if (feld !== "from" && feld !== "subject") {
      if (String(r[2] || "").trim() !== "") errors.push("rule row " + sheetRow + ": feld must be from or subject");
      return;
    }
    var test;
    try {
      test = compilePattern_(r[2]);
    } catch (e) {
      errors.push("rule row " + sheetRow + ": invalid regex");
      return;
    }
    if (!test) return;
    var impRaw = String(r[3] == null ? "" : r[3]).trim();
    var importance = null;
    if (impRaw !== "") {
      var n = Number(impRaw);
      if (n === 0 || n === 1 || n === 2 || n === 3) importance = n;
      else errors.push("rule row " + sheetRow + ": importance must be 0-3");
    }
    rules.push({
      row: sheetRow,
      field: feld,
      test: test,
      importance: importance,
      category: String(r[4] || "").trim(),
      sensitive: yesNo_(r[5], false),
      push: yesNo_(r[6], false),
    });
  });
  return { rules: rules, errors: errors };
}

/** The text a rule field is matched against. */
function ruleSubject_(mail, field) {
  if (field === "subject") return String(mail.subject || "");
  return String(mail.fromName || "") + " <" + String(mail.fromEmail || "") + ">";
}

/** First matching rule or null. */
function matchRule(rules, mail) {
  for (var i = 0; i < rules.length; i++) {
    if (rules[i].test(ruleSubject_(mail, rules[i].field))) return rules[i];
  }
  return null;
}

/**
 * Mail config derived from `config`: mail categories (enum for the AI), sensitive categories,
 * junk category used by feedback.
 */
function mailConfig(config) {
  function list(json) {
    try {
      var v = JSON.parse(json || "[]");
      return Array.isArray(v)
        ? v.filter(function (s) {
            return typeof s === "string" && s.trim() !== "";
          })
        : [];
    } catch (e) {
      return [];
    }
  }
  var categories = list(config.mailCategories);
  var sensitive = list(config.sensitiveCategories);
  var junk = String(config.junkCategory || "").trim();
  sensitive.concat(junk ? [junk] : []).forEach(function (c) {
    if (categories.indexOf(c) < 0) categories.push(c);
  });
  return { categories: categories, sensitive: sensitive, junk: junk };
}

function isSensitiveCategory(category, mcfg) {
  return !!category && mcfg.sensitive.indexOf(category) >= 0;
}

/**
 * Local classification before any AI call.
 * mail: {fromName, fromEmail, subject, labelNames: string[]}
 * Returns {rule, category, sensitive, push, importance (null = undecided), toAi}.
 * Sensitive mails and mails with a fixed rule importance never go to the AI.
 */
function classifyLocal(mail, rules, mcfg, aiAvailable) {
  var rule = matchRule(rules, mail);
  var labelCategory = "";
  (mail.labelNames || []).some(function (name) {
    if (mcfg.categories.indexOf(name) >= 0) {
      labelCategory = name;
      return true;
    }
    return false;
  });
  var category = (rule && rule.category) || labelCategory;
  var sensitive = !!(rule && rule.sensitive) || isSensitiveCategory(category, mcfg) ||
    (mail.labelNames || []).some(function (n) {
      return isSensitiveCategory(n, mcfg);
    });
  if (sensitive && !isSensitiveCategory(category, mcfg) && !(rule && rule.category)) {
    // A sensitive Gmail label beats a non-sensitive one for the category.
    (mail.labelNames || []).some(function (n) {
      if (isSensitiveCategory(n, mcfg)) {
        category = n;
        return true;
      }
      return false;
    });
  }
  var importance = rule && rule.importance !== null ? rule.importance : null;
  if (sensitive && importance === null) importance = 2;
  return {
    rule: rule,
    category: category,
    sensitive: sensitive,
    push: !!(rule && rule.push),
    importance: importance,
    toAi: importance === null && !sensitive && !!aiAvailable,
  };
}

/** Text from a quick-add input counts as sensitive when a sensitive subject rule matches it. */
function isSensitiveText(text, rules) {
  return rules.some(function (r) {
    return r.sensitive && r.field === "subject" && r.test(String(text || ""));
  });
}

/** Feedback -> rule row to insert or update. Returns {row, matchIndex} (matchIndex -1 = new). */
function feedbackRule(mail, verdict, rawRules, mcfg, todayIso) {
  var email = String(mail.fromEmail || "").trim().toLowerCase();
  var important = verdict === "wichtig";
  var category = important ? mail.category || "" : mcfg.junk || mail.category || "";
  var row = [
    "ja", "from", email, important ? 2 : 0, category, mail.sensitive ? "ja" : "nein", "nein",
    "Feedback " + todayIso,
  ];
  var matchIndex = -1;
  (rawRules || []).some(function (r, i) {
    var same = String(r[1] || "").trim().toLowerCase() === "from" &&
      String(r[2] || "").trim().toLowerCase() === email;
    if (same) matchIndex = i;
    return same;
  });
  return { row: row, matchIndex: matchIndex };
}
