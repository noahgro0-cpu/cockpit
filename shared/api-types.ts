/**
 * Cockpit API contract (single source of truth, see docs/SPEC.md §2.4).
 * Only Claude Code changes this file. Clients request changes via docs/OPEN-QUESTIONS.md.
 */

/** Calendar date in Europe/Zurich, e.g. "2026-11-16". */
export type ISODate = string;
/** Date-time with explicit offset, e.g. "2026-11-16T08:30:00+01:00". */
export type ISODateTime = string;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Health {
  lastTick: ISODateTime | null;
  lastMailSync: ISODateTime | null;
  ai: "ok" | "limited" | "off";
  mode: "observe" | "active";
  errors24h: number;
}

export interface CalEvent {
  id: string;
  calendar: string;
  kind: "lecture" | "exam" | "deadline" | "private";
  title: string;
  /** ISODateTime for timed events, ISODate for all-day events. */
  start: ISODateTime | ISODate;
  /** ISODateTime for timed events, ISODate (exclusive) for all-day events. */
  end: ISODateTime | ISODate;
  allDay: boolean;
  location?: string;
  /**
   * Routine entry (D24): lecture, part of a recurring series, or from a calendar listed in
   * `config.calRoutine` (e.g. week numbers). Shown muted; "next appointment" ignores it.
   */
  routine?: boolean;
  /**
   * Subject (id of a category with group "schule", D27): explicit tag of events created by Cockpit,
   * else matched by the subject keywords in the title. Missing = no subject. D28: a subject chosen
   * by hand (event.update) wins and covers every instance of a series.
   */
  subject?: string;
  /**
   * D28: title, time, place (and for exams the kind) can be changed with event.update and the
   * event can be deleted. Missing for lectures, recurring series and read-only calendars: these
   * only take a subject choice.
   */
  editable?: boolean;
}

export interface Todo {
  id: string;
  title: string;
  notes?: string;
  category?: string;
  due?: ISODate | ISODateTime;
  dueHasTime: boolean;
  remindAt?: ISODateTime;
  priority: 0 | 1 | 2;
  status: "open" | "done";
  source: "manual" | "quick" | "mail";
  mailId?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  doneAt?: ISODateTime;
}

export interface MailItem {
  id: string;
  threadId: string;
  receivedAt: ISODateTime;
  fromName: string;
  fromEmail: string;
  subject: string;
  category: string;
  /** 0 = unwichtig, 1 = Info, 2 = wichtig, 3 = dringend */
  importance: 0 | 1 | 2 | 3;
  summary: string;
  actionRequired: boolean;
  deadline?: ISODate;
  consequence?: string;
  sensitive: boolean;
  classifiedBy: "rule" | "ai" | "none";
  todoId?: string;
  /**
   * Mailbox the mail arrived in, as labelled in `config.mailAccounts` (D25), e.g. "Schule",
   * "Privat", "Geschäftlich". Missing when unknown.
   */
  account?: string;
}

export interface Category {
  id: string;
  label: string;
  color: string;
  group: "schule" | "privat";
}

export interface SubjectLink {
  label: string;
  /** http(s) only. */
  url: string;
}

/**
 * Subject page ("Fächer", D27): one per category with group "schule" (same id). Stored in the
 * sheet tab `faecher`. Label and colour come from the category.
 */
export interface Subject {
  id: string;
  /** Words that assign calendar entries and rule-based to-dos (match at word starts). Empty = the category label. */
  keywords: string[];
  /** Basic info, plain text, at most 2000 characters. */
  info: string;
  /** At most 20. */
  links: SubjectLink[];
  /** Plain text notes before D28; moved to note pages by the schema update, then empty. */
  notes: string;
  updatedAt: ISODateTime | null;
}

/**
 * Note page of a subject (D28). `html` comes from the PWA editor; it is always parsed through the
 * editor schema, never inserted as raw HTML. Images are referenced as <img data-image="id">.
 */
export interface NotePage {
  id: string;
  subject: string;
  /** One line, at most 100 characters. */
  title: string;
  /** At most 45 000 characters. */
  html: string;
  createdAt: ISODateTime | null;
  updatedAt: ISODateTime | null;
}

/** event.update patch (D28). date/start/end set the time together: date alone = all-day. */
export interface EventPatch {
  title?: string;
  date?: ISODate;
  /** HH:MM, Europe/Zurich. */
  start?: string;
  /** HH:MM, needs start; default start + 60 min. */
  end?: string;
  location?: string;
  /** Exams calendar only. */
  kind?: "exam" | "deadline";
  /** Subject id, "-" = no subject, null = automatic (keywords). Allowed on every event. */
  subject?: string | null;
}

export interface SubjectPatch {
  keywords?: string[];
  info?: string;
  links?: SubjectLink[];
  notes?: string;
}

export interface Briefing {
  date: ISODate;
  text: string;
}

export interface Settings {
  categories: Category[];
  homeStop: string;
  campusStop: string;
  lat: number;
  lon: number;
}

export interface State {
  schema: 1;
  generatedAt: ISODateTime;
  health: Health;
  /** This week's Monday (or yesterday, if earlier) until +42 days, sorted by start (D23). */
  events: CalEvent[];
  /** kind exam|deadline, until +120 days. */
  exams: CalEvent[];
  /** All open todos + todos done within the last 7 days. */
  todos: Todo[];
  /** Last 14 days, importance >= 1, not dismissed, at most 50. */
  mails: MailItem[];
  briefing: Briefing | null;
  settings: Settings;
  /** One per school category (D27). Optional: missing in states cached before 2026-11-16. */
  subjects?: Subject[];
  /** Note pages of all subjects, newest first (D28). Optional: missing in older cached states. */
  notes?: NotePage[];
}

/** Compact state for Scriptable widgets (action `getWidget`). */
export interface WidgetState {
  schema: 1;
  generatedAt: ISODateTime;
  health: Health;
  /** Next upcoming (or currently running) timed event that is not a lecture or routine entry (D25), null if none in the next 42 days. */
  nextEvent: CalEvent | null;
  /** Today's events (for the medium widget agenda). */
  today: CalEvent[];
  /** The 5 next open todos (overdue first, then by due date, then priority). */
  todos: Todo[];
  /** The 3 most important mails (importance desc, then newest first). */
  mails: MailItem[];
  /**
   * Events of the Zurich calendar week of `generatedAt` (Monday..Sunday), incl. events that start
   * earlier and reach into the week; sorted by start. All-day `end` stays exclusive. `[]` = no events.
   * Optional for compatibility; the backend always sends it since 2026-11-16.
   */
  week?: CalEvent[];
  /**
   * D27: events that have not ended and start within the next 7 days, incl. lectures, without other
   * routine entries; sorted, at most 12. Optional for compatibility with cached responses.
   */
  upcoming?: CalEvent[];
  /** D27: number of all open to-dos (`todos` holds only 5). Optional for compatibility. */
  todoCount?: number;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export type ApiErrorCode = "unauthorized" | "bad_request" | "not_found" | "busy" | "internal";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

/** Every response is HTTP 200 with one of these bodies. */
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface TodoAddPayload {
  /** UUID generated by the client; makes retries idempotent. */
  id: string;
  title: string;
  notes?: string;
  category?: string;
  due?: ISODate | ISODateTime;
  dueHasTime?: boolean;
  remindAt?: ISODateTime;
  priority?: 0 | 1 | 2;
}

/** Fields a client may change via `settings.update` (at least one). `categories` replaces the whole list. */
export type SettingsPatch = Partial<Settings>;

/** Fields a client may change via `todo.update`. `null` clears an optional field. */
export interface TodoPatch {
  title?: string;
  notes?: string | null;
  category?: string | null;
  due?: ISODate | ISODateTime | null;
  dueHasTime?: boolean;
  remindAt?: ISODateTime | null;
  priority?: 0 | 1 | 2;
}

/** One entry created by `capture`. */
export type CaptureItem = { type: "todo"; todo: Todo } | { type: "event"; event: CalEvent };

/**
 * Result of `capture`. One sentence can yield up to 3 entries (D23), e.g. a meeting and a to-do for it.
 * The first entry is repeated at top level (`type` + `todo`/`event`) for older clients; `items` holds
 * all of them in order. `message` has one German line per entry.
 */
export type CaptureResult = CaptureItem & { items: CaptureItem[]; message: string; dryRun?: true };

/** Maps every action to its payload and the `data` type of a successful response. */
export interface ApiActions {
  ping: { payload: Record<string, never> | undefined; data: { time: ISODateTime } };
  getState: { payload: Record<string, never> | undefined; data: State };
  getWidget: { payload: Record<string, never> | undefined; data: WidgetState };
  "todo.add": { payload: TodoAddPayload; data: Todo };
  "todo.update": { payload: { id: string; patch: TodoPatch }; data: Todo };
  "todo.complete": { payload: { id: string; done: boolean }; data: Todo };
  "todo.delete": { payload: { id: string }; data: { id: string } };
  /** `id` (client UUID) is optional and makes retries idempotent; Siri sends only `{text}`. */
  quickAdd: { payload: { text: string; id?: string }; data: Todo };
  /**
   * One sentence -> up to 3 to-dos and/or calendar events (D22, D23); the backend AI decides and
   * shortens titles. Events go to
   * `config.calCapture` or the default calendar. Vague dates: "nächste Woche" = Monday,
   * "Ende nächste Woche" = Friday (see D22). `id` makes retries idempotent (to-dos: always; events: for 6 h, best effort via cache). `dryRun` parses only
   * and writes nothing (event.id and event.calendar are then empty). `message` is a short German
   * confirmation, e.g. for a Siri shortcut notification.
   */
  capture: { payload: { text: string; id?: string; dryRun?: boolean }; data: CaptureResult };
  /** Idempotent: returns the existing to-do of the mail or its thread. */
  "mail.toTodo": { payload: { id: string }; data: Todo };
  /** Idempotent. */
  "mail.dismiss": { payload: { id: string }; data: { id: string } };
  /** Idempotent: a repeat updates the sender rule instead of adding one (`ruleAdded: false`). */
  "mail.feedback": { payload: { id: string; verdict: "wichtig" | "unwichtig" }; data: { ruleAdded: boolean } };
  /** Writes the given fields to the sheet tab `config`; returns the new settings. Idempotent. */
  "settings.update": { payload: SettingsPatch; data: Settings };
  /**
   * D27: "exams" = all-day exam/deadline in the exams calendar; "default" = appointment in
   * `config.calCapture` (else the default calendar), all-day without `start`, end default +60 min.
   * Idempotent per calendar + title + start. `subject` is stored as an event tag.
   */
  "event.add": {
    payload:
      | { calendar: "exams"; title: string; date: ISODate; kind: "exam" | "deadline"; subject?: string }
      | { calendar: "default"; title: string; date: ISODate; start?: string; end?: string; location?: string; subject?: string };
    data: CalEvent;
  };
  /**
   * Updates a subject page (D27). Idempotent. `base` = textHash (FNV-1a, see web/src/subjectData.ts) of
   * the info/notes text the edit started from: if the stored text changed meanwhile on another
   * device, the backend keeps both versions instead of overwriting one.
   */
  "subject.update": {
    payload: { id: string; patch: SubjectPatch; base?: { info?: string; notes?: string } };
    data: Subject;
  };
  /**
   * D28. `id`/`calendar` as in CalEvent. The answer is the changed event; its id changes when
   * the start changes. Fields other than `subject` need `editable`, else bad_request.
   */
  "event.update": { payload: { id: string; calendar: string; patch: EventPatch }; data: CalEvent };
  /** D28. Only editable events; idempotent. */
  "event.delete": { payload: { id: string; calendar: string }; data: { id: string } };
  /** D28. Idempotent per id. */
  "note.add": { payload: { id: string; subject: string; title: string; html?: string }; data: NotePage };
  /** D28. base.html = textHash of the html the edit started from (both versions kept on conflict). */
  "note.update": { payload: { id: string; patch: { title?: string; html?: string }; base?: { html: string } }; data: NotePage };
  "note.delete": { payload: { id: string }; data: { id: string } };
  /** D28. Picture for a note page, stored in Google Drive; data = base64, at most about 2 MB. */
  "image.add": { payload: { id: string; subject: string; type: "image/jpeg" | "image/png" | "image/webp"; data: string }; data: { id: string } };
  "image.get": { payload: { id: string }; data: { id: string; type: string; data: string } };
  /**
   * Sent by the iOS shortcut (D20). Stores only the latest location, rounded to ~1 km; it is used
   * for the briefing weather while it is at most 12 h old and never appears in `getState`.
   * lat/lon may be strings with a decimal comma (as iOS sends them). `name` = locality, optional.
   */
  "location.update": { payload: { lat: number | string; lon: number | string; name?: string }; data: { at: ISODateTime } };
  /**
   * Briefing text as generated now (incl. weather); sends and stores nothing.
   * `date` (today to +7 days) previews that day as at its briefing time.
   */
  "briefing.preview": { payload: { date?: ISODate } | undefined; data: { text: string } };
}

export type ApiAction = keyof ApiActions;

/**
 * Request body. Sent as `POST <web-app-url>` with
 * `Content-Type: text/plain;charset=utf-8` and no custom headers (avoids CORS preflight).
 */
export interface ApiRequest<A extends ApiAction = ApiAction> {
  key: string;
  action: A;
  payload?: ApiActions[A]["payload"];
}

export type ApiResult<A extends ApiAction> = ApiResponse<ApiActions[A]["data"]>;
