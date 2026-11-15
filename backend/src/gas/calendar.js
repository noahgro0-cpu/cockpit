/** Google Calendar access. */

var EVENT_KIND_TAG = "cockpitKind";

function toCalEvent_(ev, calendarName, config, withTag, subjects) {
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
  CalendarApp.getAllCalendars().forEach(function (cal) {
    var name = cal.getName();
    var ours = name === config.calLectures || name === config.calExams;
    if (!ours && (cal.isHidden() || !cal.isSelected())) return;
    var isExams = name === config.calExams;
    cal.getEvents(from, to).forEach(function (ev) {
      events.push(toCalEvent_(ev, name, config, isExams, subjects));
    });
    if (isExams) {
      cal.getEvents(zurichMidnight(today), zurichMidnight(addDaysIso(today, 121))).forEach(function (ev) {
        exams.push(toCalEvent_(ev, name, config, true));
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

/** `event.add`: all-day event in the exams calendar. Idempotent per title + date. */
function addExamEvent_(p) {
  var config = readConfig_();
  var cal = examCalendar_(config);
  if (!cal) throw apiError("not_found", "Exam calendar not found (run setup)");
  var parts = p.date.split("-");
  var day = new Date(+parts[0], +parts[1] - 1, +parts[2]); // script time zone = Europe/Zurich
  var title = p.title.trim();
  var existing = cal.getEventsForDay(day).filter(function (ev) {
    return ev.isAllDayEvent() && ev.getTitle() === title;
  });
  var ev = existing.length ? existing[0] : cal.createAllDayEvent(title, day);
  ev.setTag(EVENT_KIND_TAG, p.kind);
  return toCalEvent_(ev, cal.getName(), config, true);
}

/**
 * Calendar for captured events: config.calCapture (name) or the default calendar.
 * ev = {title, allDay, start, end, location?} from parseCaptureResult.
 */
function createCaptureEvent_(ev, config) {
  var cal = null;
  if (config.calCapture) {
    var found = CalendarApp.getCalendarsByName(config.calCapture);
    if (found.length) cal = found[0];
  }
  if (!cal) cal = CalendarApp.getDefaultCalendar();
  var opts = ev.location ? { location: ev.location } : {};
  var created;
  if (ev.allDay) {
    var p = ev.start.split("-");
    created = cal.createAllDayEvent(ev.title, new Date(+p[0], +p[1] - 1, +p[2]), opts); // script time zone = Europe/Zurich
  } else {
    created = cal.createEvent(ev.title, ev.start, ev.end, opts);
  }
  return toCalEvent_(created, cal.getName(), config, false);
}
