/** Google Calendar access. */

var EVENT_KIND_TAG = "cockpitKind";
// D27: subject (school category id) of events created by Cockpit; other events match by keywords.
var EVENT_SUBJECT_TAG = "cockpitSubject";

function toCalEvent_(ev, calendarName, config, withTag, subjects, writable) {
  var allDay = ev.isAllDayEvent();
  var title = ev.getTitle();
  var tag = withTag ? ev.getTag(EVENT_KIND_TAG) || "" : "";
  var kind = eventKind(calendarName, config, tag, title);
  var e = {
    // Instances of a recurring series share getId(); the start time makes the id unique.
    id: ev.getId() + "_" + ev.getStartTime().getTime(),
    calendar: calendarName,
    kind: kind,
    // D25: readable lecture names from the sheet tab "Fächer Namen".
    title: kind === "lecture" && subjects ? subjectName(title, subjects) : title,
    start: allDay ? toZurichDate(ev.getAllDayStartDate()) : toZurichIso(ev.getStartTime()),
    end: allDay ? toZurichDate(ev.getAllDayEndDate()) : toZurichIso(ev.getEndTime()),
    allDay: allDay,
  };
  var loc = ev.getLocation();
  if (loc) e.location = loc;
  var recurring = false;
  try {
    recurring = ev.isRecurringEvent();
  } catch (err) {
    recurring = false;
  }
  if (isRoutineEvent(e.kind, calendarName, recurring, config)) e.routine = true;
  // D28: title and time can be changed in Cockpit for single events in an own calendar. Lectures
  // (mapped titles), series and subscribed calendars keep only the subject choice.
  if (writable && !recurring && kind !== "lecture") e.editable = true;
  var subject = withTag ? ev.getTag(EVENT_SUBJECT_TAG) || "" : "";
  if (subject) e.subject = subject;
  return e;
}

/** events: this week's Monday (or yesterday, if earlier) .. +42 days (all visible calendars); exams: today .. +120 days. */
function readCalendarEvents_(config, now) {
  var today = toZurichDate(now);
  var range = calendarRange(today);
  var from = zurichMidnight(range.from);
  var to = zurichMidnight(range.to);
  var events = [];
  var exams = [];
  var subjects = readSubjectNames_();
  var captureId = captureCalendar_(config).getId();
  CalendarApp.getAllCalendars().forEach(function (cal) {
    var name = cal.getName();
    var ours = name === config.calLectures || name === config.calExams;
    if (!ours && (cal.isHidden() || !cal.isSelected())) return;
    var isExams = name === config.calExams;
    // Tags exist only on events Cockpit created: read them only in its own calendars.
    var tagged = isExams || cal.getId() === captureId;
    var writable = name !== config.calLectures && calendarWritable_(cal);
    cal.getEvents(from, to).forEach(function (ev) {
      events.push(toCalEvent_(ev, name, config, tagged, subjects, writable));
    });
    if (isExams) {
      cal.getEvents(zurichMidnight(today), zurichMidnight(addDaysIso(today, 121))).forEach(function (ev) {
        exams.push(toCalEvent_(ev, name, config, true, null, writable));
      });
    }
  });
  return { events: events, exams: exams };
}

/** Pairs [timetable title, display name] from the tab "Fächer Namen" (name matched loosely); [] if missing. */
function readSubjectNames_() {
  try {
    var sh = null;
    ss_().getSheets().forEach(function (s) {
      if (!sh && s.getName().toLowerCase().replace(/[^a-zäöü]/g, "") === "fächernamen") sh = s;
    });
    if (!sh || sh.getLastRow() < 1) return [];
    return sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
  } catch (e) {
    return [];
  }
}

function examCalendar_(config) {
  var cals = CalendarApp.getCalendarsByName(config.calExams);
  return cals.length ? cals[0] : null;
}

/**
 * `event.add` (D27): calendar "exams" = all-day exam/deadline in the exams calendar; calendar
 * "default" = appointment in config.calCapture (else the default calendar), all-day without
 * `start`, else timed (end default +60 min). Idempotent per calendar + title + start.
 */
function addEvent_(p) {
  var config = readConfig_();
  var cal = p.calendar === "exams" ? examCalendar_(config) : captureCalendar_(config);
  if (!cal) throw apiError("not_found", "Exam calendar not found (run setup)");
  var title = p.title.trim();
  var span = eventAddSpan(p);
  var parts = p.date.split("-");
  var day = new Date(+parts[0], +parts[1] - 1, +parts[2]); // script time zone = Europe/Zurich
  var existing = cal.getEventsForDay(day).filter(function (ev) {
    if (ev.getTitle() !== title || ev.isAllDayEvent() !== span.allDay) return false;
    return span.allDay || ev.getStartTime().getTime() === span.start.getTime();
  });
  var ev = existing.length ? existing[0] : null;
  if (!ev) {
    var opts = p.location ? { location: p.location.trim() } : {};
    ev = span.allDay ? cal.createAllDayEvent(title, day, opts) : cal.createEvent(title, span.start, span.end, opts);
  }
  if (p.calendar === "exams") ev.setTag(EVENT_KIND_TAG, p.kind);
  if (p.subject) ev.setTag(EVENT_SUBJECT_TAG, p.subject);
  return toCalEvent_(ev, cal.getName(), config, true, readSubjectNames_(), true);
}

function captureCalendar_(config) {
  if (config.calCapture) {
    var found = CalendarApp.getCalendarsByName(config.calCapture);
    if (found.length) return found[0];
  }
  return CalendarApp.getDefaultCalendar();
}

/**
 * Calendar for captured events: config.calCapture (name) or the default calendar.
 * ev = {title, allDay, start, end, location?, subject?} from parseCaptureResult.
 */
function createCaptureEvent_(ev, config) {
  var cal = captureCalendar_(config);
  var opts = ev.location ? { location: ev.location } : {};
  var created;
  if (ev.allDay) {
    var p = ev.start.split("-");
    created = cal.createAllDayEvent(ev.title, new Date(+p[0], +p[1] - 1, +p[2]), opts); // script time zone = Europe/Zurich
  } else {
    created = cal.createEvent(ev.title, ev.start, ev.end, opts);
  }
  if (ev.subject) created.setTag(EVENT_SUBJECT_TAG, ev.subject);
  return toCalEvent_(created, cal.getName(), config, true, null, true);
}

/** Invitations from others sit in own calendars too but cannot be changed by us. */
function ownEvent_(ev) {
  try {
    return ev.isOwnedByMe();
  } catch (e) {
    return false;
  }
}

/** A refused calendar change is a clear, final answer (bad_request), never an endless retry. */
function calendarCall_(fn) {
  try {
    fn();
  } catch (e) {
    if (e && e.apiError) throw e;
    log_("warn", "calendar", "edit refused: " + (e && e.message ? e.message : e));
    throw apiError("bad_request", "Der Kalender hat die Änderung abgelehnt: " + String(e && e.message ? e.message : e).slice(0, 160));
  }
}

/** Own calendars are writable; subscribed and read-only shared ones are not (D28). */
function calendarWritable_(cal) {
  try {
    return cal.isOwnedByMe();
  } catch (e) {
    return false;
  }
}

/**
 * The calendar event behind a Cockpit event id (iCalUID + "_" + start ms) in the named calendar,
 * or null. Searches around the start, so it finds a single instance of a series too.
 */
function findEvent_(calendarName, id) {
  var cals = CalendarApp.getCalendarsByName(calendarName);
  if (!cals.length) return null;
  var uid = eventKey(id);
  var ms = Number(id.slice(id.lastIndexOf("_") + 1));
  var hits = cals[0].getEvents(new Date(ms - 1000), new Date(ms + 60000)).filter(function (ev) {
    return ev.getId() === uid && ev.getStartTime().getTime() === ms;
  });
  return hits.length ? { cal: cals[0], ev: hits[0] } : null;
}

/** The event as getState shows it, after an edit (with the subject chosen by hand applied). */
function eventView_(cal, ev, config) {
  var tagged = cal.getName() === config.calExams || cal.getId() === captureCalendar_(config).getId();
  var e = toCalEvent_(ev, cal.getName(), config, tagged, readSubjectNames_(), cal.getName() !== config.calLectures && calendarWritable_(cal));
  return assignEventSubjects([e], subjectMatchers_(config), readEventSubjects_())[0];
}

/** event.update (D28, caller holds the write lock). */
function updateEvent_(p) {
  var config = readConfig_();
  var found = findEvent_(p.calendar, p.id);
  if (!found) throw apiError("not_found", "Termin nicht gefunden (inzwischen geändert oder gelöscht?)");
  var patch = p.patch;
  if (patch.subject !== undefined) setEventSubject_(eventKey(p.id), patch.subject);
  var changes = Object.keys(patch).filter(function (k) {
    return k !== "subject";
  });
  if (changes.length) {
    var view = eventView_(found.cal, found.ev, config);
    if (!view.editable || !ownEvent_(found.ev)) throw apiError("bad_request", "Dieser Termin kann nur im Kalender selbst geändert werden.");
    var ev = found.ev;
    calendarCall_(function () {
    if (patch.title !== undefined) ev.setTitle(patch.title.trim());
    if (patch.location !== undefined) ev.setLocation(patch.location.trim());
    var span = eventPatchSpan(patch);
    if (span && view.calendar === config.calExams && !span.allDay) throw apiError("bad_request", "Prüfungen und Abgaben sind ganztägig.");
    if (span) {
      var parts = patch.date.split("-");
      if (span.allDay) ev.setAllDayDate(new Date(+parts[0], +parts[1] - 1, +parts[2])); // script time zone = Europe/Zurich
      else ev.setTime(span.start, span.end);
    }
    if (patch.kind !== undefined && view.calendar === config.calExams) ev.setTag(EVENT_KIND_TAG, patch.kind);
    });
  }
  return eventView_(found.cal, found.ev, config);
}

/** event.delete (D28): only events Cockpit may edit; idempotent (gone = done). */
function deleteEvent_(p) {
  var config = readConfig_();
  var found = findEvent_(p.calendar, p.id);
  if (!found) return { id: p.id };
  if (!eventView_(found.cal, found.ev, config).editable || !ownEvent_(found.ev)) {
    throw apiError("bad_request", "Dieser Termin kann nur im Kalender selbst gelöscht werden.");
  }
  calendarCall_(function () {
    found.ev.deleteEvent();
  });
  setEventSubject_(eventKey(p.id), null);
  return { id: p.id };
}
