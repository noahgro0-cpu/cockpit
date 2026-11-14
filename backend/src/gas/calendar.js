/** Google Calendar access. */

var EVENT_KIND_TAG = "cockpitKind";

function toCalEvent_(ev, calendarName, config, withTag) {
  var allDay = ev.isAllDayEvent();
  var title = ev.getTitle();
  var tag = withTag ? ev.getTag(EVENT_KIND_TAG) || "" : "";
  var e = {
    // Instances of a recurring series share getId(); the start time makes the id unique.
    id: ev.getId() + "_" + ev.getStartTime().getTime(),
    calendar: calendarName,
    kind: eventKind(calendarName, config, tag, title),
    title: title,
    start: allDay ? toZurichDate(ev.getAllDayStartDate()) : toZurichIso(ev.getStartTime()),
    end: allDay ? toZurichDate(ev.getAllDayEndDate()) : toZurichIso(ev.getEndTime()),
    allDay: allDay,
  };
  var loc = ev.getLocation();
  if (loc) e.location = loc;
  return e;
}

/** events: yesterday .. +21 days (all visible calendars); exams: today .. +120 days. */
function readCalendarEvents_(config, now) {
  var today = toZurichDate(now);
  var from = zurichMidnight(addDaysIso(today, -1));
  var to = zurichMidnight(addDaysIso(today, 22));
  var events = [];
  var exams = [];
  CalendarApp.getAllCalendars().forEach(function (cal) {
    var name = cal.getName();
    var ours = name === config.calLectures || name === config.calExams;
    if (!ours && (cal.isHidden() || !cal.isSelected())) return;
    var isExams = name === config.calExams;
    cal.getEvents(from, to).forEach(function (ev) {
      events.push(toCalEvent_(ev, name, config, isExams));
    });
    if (isExams) {
      cal.getEvents(zurichMidnight(today), zurichMidnight(addDaysIso(today, 121))).forEach(function (ev) {
        exams.push(toCalEvent_(ev, name, config, true));
      });
    }
  });
  return { events: events, exams: exams };
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
