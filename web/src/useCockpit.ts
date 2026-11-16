import { useCallback, useEffect, useRef, useState } from "react";
import type { State, Settings, CaptureResult } from "../../shared/api-types";
import { ApiFailure, parseSetup, request, type Connection } from "./api";
import {
  coalesce,
  drain,
  makeJob,
  optimistic,
  storage,
  type Job,
  type Mutation,
  type Snapshot,
} from "./outbox";
import { loadMock, MOCK, validState } from "./model";
import { base64ToBlob, blobToBase64, shrinkImage } from "./images";
import type { ImageStore } from "./NoteEditor";

// Object URLs of note pictures, kept for the session (D28).
const imageUrls = new Map<string, string>();
const SETTINGS_KEY = MOCK ? "cockpit.demo.settings" : "cockpit.settings";
export function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function useCockpit() {
  const [connection, setConnection] = useState<Connection | null>(() =>
    MOCK ? null : stored("cockpit.connection", null),
  );
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  // D26: confirmations disappear after 12 s instead of staying forever.
  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(""), 12000);
    return () => clearTimeout(timer);
  }, [confirmation]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [localSettings, setLocalSettings] = useState<Settings | null>(() =>
    stored(SETTINGS_KEY, null),
  );
  const running = useRef(false);
  const base = useRef<Snapshot | undefined>(undefined);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const save = useCallback(async (value: Snapshot) => {
    await storage.save(value);
    base.current = value;
    setSnapshot(value);
  }, []);
  const synchronize = useCallback(async () => {
    if (running.current || (!connection && !MOCK) || document.hidden) return;
    if (!navigator.onLine) {
      setError("Offline. Änderungen bleiben auf diesem Gerät gespeichert.");
      return;
    }
    running.current = true;
    setBusy(true);
    try {
      const latest = await storage.snapshot();
      if (latest && validState(latest.state)) base.current = latest;
      let rejection = "";
      await drain(
        storage,
        async (job) => {
          if (MOCK) {
            if (job.action === "capture")
              throw new ApiFailure(
                "bad_request",
                "Schnellerfassung benötigt eine echte Verbindung. Dein Text bleibt in den Einstellungen erhalten.",
              );
            return null;
          }
          return request(connection!, job.action, job.payload);
        },
        Date.now(),
        async (job, result) => {
          if (job.action === "capture") {
            const captured = result as CaptureResult;
            if (base.current) {
              const state = structuredClone(base.current.state);
              for (const item of captured.items) {
                if (item.type === "todo")
                  state.todos = [
                    ...state.todos.filter((t) => t.id !== item.todo.id),
                    item.todo,
                  ];
                else
                  state.events = [
                    ...state.events.filter((e) => e.id !== item.event.id),
                    item.event,
                  ];
              }
              await save({ ...base.current, state });
            }
            setConfirmation(captured.message);
            return;
          }
          if (base.current) {
            let state = optimistic(base.current.state, job);
            if (result && typeof result === "object" && "status" in result) {
              const todo = result as State["todos"][number];
              state = {
                ...state,
                todos: [
                  ...state.todos.filter(
                    (t) =>
                      t.id !== todo.id &&
                      !(job.action === "mail.toTodo" && t.id === job.id),
                  ),
                  todo,
                ],
              };
            }
            if (job.action === "subject.update" && result && typeof result === "object" && "notes" in result) {
              const subject = result as NonNullable<State["subjects"]>[number];
              state = {
                ...state,
                subjects: [...(state.subjects ?? []).filter((s) => s.id !== subject.id), subject],
              };
            }
            if (
              (job.action === "note.add" || job.action === "note.update") &&
              result &&
              typeof result === "object" &&
              "html" in result
            ) {
              const note = result as NonNullable<State["notes"]>[number];
              state = { ...state, notes: (state.notes ?? []).map((n) => (n.id === note.id ? note : n)) };
            }
            if (job.action === "event.update" && result && typeof result === "object" && "start" in result) {
              // D28: the id changes with the start; later jobs for the same event follow it.
              const event = result as State["events"][number];
              const old = job.payload.id;
              const swap = (list: State["events"]) =>
                list.some((e) => e.id === old) ? [...list.filter((e) => e.id !== old && e.id !== event.id), event] : list;
              state = { ...state, events: swap(state.events), exams: swap(state.exams) };
              if (event.id !== old)
                for (const later of await storage.jobs())
                  if ((later.action === "event.update" || later.action === "event.delete") && later.payload.id === old)
                    await storage.put({ ...later, payload: { ...later.payload, id: event.id } } as Job);
            }
            if (
              job.action === "event.add" &&
              result &&
              typeof result === "object" &&
              "start" in result
            ) {
              const event = result as State["events"][number];
              state = {
                ...state,
                events: [
                  ...state.events.filter(
                    (e) => e.id !== job.id && e.id !== event.id,
                  ),
                  event,
                ],
                exams: [
                  ...state.exams.filter(
                    (e) => e.id !== job.id && e.id !== event.id,
                  ),
                  ...(job.payload.calendar === "exams" ? [event] : []),
                ],
              };
            }
            await save({ ...base.current, state });
          }
        },
        (_job, failure) => {
          rejection = failure.message;
        },
      );
      setJobs(await storage.jobs());
      if (MOCK) {
        if (!base.current)
          await save({ state: await loadMock(), fetchedAt: Date.now() });
      } else {
        const state = await request(connection!, "getState", {});
        if (!validState(state))
          throw new ApiFailure(
            "invalid_response",
            "Der Server liefert keinen gültigen State.",
          );
        if (connectionRef.current !== connection) return;
        await save({ state, fetchedAt: Date.now() });
      }
      setError(rejection);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Synchronisierung fehlgeschlagen.",
      );
      try {
        setJobs(await storage.jobs());
      } catch {
        setError(
          "Lokaler Speicher nicht verfügbar. Bitte Browsereinstellungen prüfen.",
        );
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [connection, save]);
  const refresh = useCallback(async () => {
    if (navigator.locks)
      await navigator.locks.request(
        MOCK ? "cockpit-demo-sync" : "cockpit-sync",
        { ifAvailable: true },
        async (lock) => {
          if (lock) await synchronize();
        },
      );
    else await synchronize();
  }, [synchronize]);
  useEffect(() => {
    let active = true;
    async function boot() {
      try {
        const cached = await storage.snapshot();
        if (active && cached && validState(cached.state)) {
          base.current = cached;
          setSnapshot(cached);
        }
        if (active) setJobs(await storage.jobs());
      } catch {
        setError("Lokaler Speicher ist nicht verfügbar.");
      }
      if (active) {
        setReady(true);
        void refresh();
      }
    }
    void boot();
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    const trigger = () => void refresh();
    window.addEventListener("focus", trigger);
    window.addEventListener("online", trigger);
    document.addEventListener("visibilitychange", trigger);
    const timer = setInterval(trigger, 60000);
    const retry = setInterval(() => {
      if (jobs.length) trigger();
    }, 10000);
    return () => {
      clearInterval(timer);
      clearInterval(retry);
      window.removeEventListener("focus", trigger);
      window.removeEventListener("online", trigger);
      document.removeEventListener("visibilitychange", trigger);
    };
  }, [refresh, jobs.length]);
  async function mutate(mutation: Mutation) {
    try {
      const queued = await storage.jobs();
      const merged = running.current ? null : coalesce(queued[queued.length - 1], mutation);
      const job = merged ?? makeJob(mutation);
      await storage.put(job);
      setJobs(await storage.jobs());
      if (mutation.action === "capture")
        setConfirmation(
          "Eingabe auf diesem Gerät gespeichert. Bestätigung folgt nach der Synchronisierung.",
        );
      void refresh();
    } catch {
      const message =
        "Änderung konnte nicht lokal gespeichert werden. Bitte erneut versuchen.";
      setError(message);
      if (mutation.action === "capture") throw new Error(message);
    }
  }
  /** D28: pictures of a subject's note pages (device cache first, then the backend). */
  function images(subject: string): ImageStore {
    return {
      async url(id) {
        const known = imageUrls.get(id);
        if (known) return known;
        let blob = await storage.image(id).catch(() => undefined);
        if (!blob && connectionRef.current && !MOCK && navigator.onLine) {
          try {
            const r = await request(connectionRef.current, "image.get", { id });
            blob = base64ToBlob(r.data, r.type);
            await storage.putImage(id, blob).catch(() => undefined);
          } catch {
            return null;
          }
        }
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        imageUrls.set(id, url);
        return url;
      },
      async add(file) {
        const blob = await shrinkImage(file);
        const id = crypto.randomUUID();
        await storage.putImage(id, blob);
        await mutate({ action: "image.add", payload: { id, subject, type: "image/jpeg", data: await blobToBase64(blob) } });
        return id;
      },
    };
  }
  async function setup(code: string) {
    const next = parseSetup(code);
    await request(next, "ping", {});
    await storage.clear();
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem("cockpit.travel");
    localStorage.removeItem("cockpit.weather");
    setLocalSettings(null);
    base.current = undefined;
    setSnapshot(undefined);
    setJobs([]);
    localStorage.setItem("cockpit.connection", JSON.stringify(next));
    setConnection(next);
  }
  async function disconnect() {
    if (running.current) return;
    await storage.clear();
    if (!MOCK) localStorage.removeItem("cockpit.connection");
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem("cockpit.travel");
    localStorage.removeItem("cockpit.weather");
    setLocalSettings(null);
    setConnection(null);
    setSnapshot(undefined);
    base.current = undefined;
    setJobs([]);
  }
  async function retry() {
    for (const job of await storage.jobs())
      if (job.action !== "capture" || !job.blocked)
        await storage.put({ ...job, blocked: undefined, nextAttempt: 0 });
    await refresh();
  }
  async function discard(id: string) {
    await storage.remove(id);
    setJobs(await storage.jobs());
    await refresh();
  }
  let state = snapshot?.state;
  for (const job of jobs)
    if (state && !job.blocked) state = optimistic(state, job);
  if (state && localSettings) state = { ...state, settings: localSettings };
  return {
    state,
    connection,
    ready,
    error,
    confirmation,
    busy,
    jobs,
    fetchedAt: snapshot?.fetchedAt ?? 0,
    /** D27: subjects come from the server categories, not the per-device settings copy. */
    serverCategories: snapshot?.state.settings.categories ?? [],
    refresh,
    mutate,
    images,
    setup,
    disconnect,
    retry,
    discard,
    settings: (settings: Settings) => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      setLocalSettings(settings);
    },
  };
}
