import { describe, it, expect } from "vitest";
import {
  day,
  time,
  shift,
  relativeStart,
  weekStart,
  daysUntil,
  groupTodos,
  importantMails,
  onDay,
  stale,
  localDateTime,
} from "./date";
import mock from "../../docs/mock-state.json";
import type { State } from "../../shared/api-types";
const state = mock as State;
describe("Zurich dates", () => {
  it("converts edited times independently of the device timezone", () => {
    expect(localDateTime("2026-03-29", "14:00")).toBe(
      "2026-03-29T12:00:00.000Z",
    );
    expect(localDateTime("2026-10-25", "14:00")).toBe(
      "2026-10-25T13:00:00.000Z",
    );
    expect(() => localDateTime("2026-03-29", "02:30")).toThrow(
      "Zeitumstellung",
    );
  });
  it("uses Zurich across UTC midnight", () => {
    expect(day("2026-11-15T23:30:00Z")).toBe("2026-11-16");
  });
  it("handles the spring gap and autumn overlap", () => {
    expect(time("2026-03-29T00:30:00Z")).toBe("01:30");
    expect(time("2026-03-29T01:30:00Z")).toBe("03:30");
    expect(time("2026-10-25T00:30:00Z")).toBe("02:30");
    expect(time("2026-10-25T01:30:00Z")).toBe("02:30");
  });
  it("counts calendar days across DST", () => {
    expect(shift("2026-03-28", 2)).toBe("2026-03-30");
    expect(daysUntil("2026-03-30", new Date("2026-03-28T23:00:00Z"))).toBe(1);
    expect(shift("2026-10-24", 2)).toBe("2026-10-26");
  });
  it("starts weeks on Monday including year boundaries", () => {
    expect(weekStart(new Date("2027-01-03T12:00:00Z"))).toBe("2026-12-28");
  });
  it("honours exclusive all-day event ends", () => {
    const event = state.events.find((e) => e.id === "evt-prv-5")!;
    expect(onDay(event, "2026-11-29")).toBe(true);
    expect(onDay(event, "2026-11-30")).toBe(false);
  });
  it("marks missing heartbeat and expired fetch as stale", () => {
    expect(stale(null, 100, 200)).toBe(true);
    expect(
      stale(
        "2026-11-16T07:10:00+01:00",
        Date.parse(state.generatedAt),
        Date.parse(state.generatedAt),
      ),
    ).toBe(false);
    expect(stale(state.generatedAt, 0, Date.parse(state.generatedAt))).toBe(
      true,
    );
  });
});
describe("grouping", () => {
  it("marks timed tasks overdue once their instant has passed", () => {
    const task = {
      ...state.todos[0],
      due: "2026-10-25T02:30:00+02:00",
      dueHasTime: true,
    };
    expect(
      groupTodos([task], new Date("2026-10-25T01:00:00Z"))["Überfällig"],
    ).toHaveLength(1);
  });
  it("puts open todos in five disjoint groups", () => {
    const groups = groupTodos(state.todos, new Date(state.generatedAt));
    expect(
      Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
    ).toEqual({
      Überfällig: 1,
      Heute: 2,
      "Diese Woche": 3,
      Später: 1,
      "Ohne Datum": 1,
    });
    expect(
      new Set(
        Object.values(groups)
          .flat()
          .map((t) => t.id),
      ).size,
    ).toBe(8);
  });
  it("does not mark a date-only task overdue during its due day", () => {
    expect(
      groupTodos(
        [{ ...state.todos[0], due: "2026-03-29" }],
        new Date("2026-03-29T21:59:00Z"),
      ).Heute,
    ).toHaveLength(1);
  });
  it("limits important mail to the last seven days", () => {
    const result = importantMails(
      state.mails.map((m) =>
        m.id === "mail-0003"
          ? { ...m, receivedAt: "2026-11-08T08:00:00+01:00" }
          : m,
      ),
      new Date(state.generatedAt),
    );
    expect(result[0].importance).toBe(3);
    expect(result.some((m) => m.id === "mail-0003")).toBe(false);
    expect(result.every((m) => m.importance >= 2)).toBe(true);
  });
});

describe("relativeStart", () => {
  const now = new Date("2026-11-15T19:25:00+01:00");
  it("uses minutes, hours, tomorrow and days", () => {
    expect(relativeStart("2026-11-15T19:00:00+01:00", now)).toBe("Jetzt");
    expect(relativeStart("2026-11-15T19:50:00+01:00", now)).toBe("in 25 Min.");
    expect(relativeStart("2026-11-15T22:30:00+01:00", now)).toBe("in 3 Std.");
    expect(relativeStart("2026-11-16T08:30:00+01:00", now)).toBe("morgen");
    expect(relativeStart("2026-11-19T08:30:00+01:00", now)).toBe("in 4 Tagen");
  });
});
