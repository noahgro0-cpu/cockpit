import { describe, expect, it } from "vitest";
import type { State } from "../../shared/api-types";
import mock from "../../docs/mock-state.json";
import { inDays, linkParts, nextExam, nextLecture, parseKeywordInput, subjectEvents, subjectList, subjectTodos, textHash } from "./subjectData";

const state = mock as unknown as State;
const now = new Date("2026-11-16T07:12:00+01:00");

describe("subjects", () => {
  it("hashes exactly like the backend", () => {
    expect(textHash("")).toBe("811c9dc5");
    expect(textHash("abc")).toBe("1a47e90b");
  });
  it("lists school categories only, merged with stored data, also without state.subjects", () => {
    const list = subjectList(state.settings.categories, state.subjects);
    expect(list.map((s) => s.id)).toEqual(["analysis", "linalg", "physik", "programmieren", "statistik"]);
    expect(list[0].links.length).toBe(2);
    expect(subjectList(state.settings.categories, undefined)[0]).toMatchObject({ id: "analysis", notes: "", links: [] });
  });
  it("finds appointments, the next lecture and the exam countdown of a subject", () => {
    expect(subjectEvents(state, "analysis", now).map((e) => e.title)).toEqual(["Zwischenprüfung Analysis"]);
    expect(nextLecture(state, "analysis", now)?.start).toBe("2026-11-16T08:15:00+01:00");
    expect(nextExam(state, "programmieren", now)).toMatchObject({ days: 11 });
    expect(inDays(1)).toBe("morgen");
    expect(subjectTodos(state.todos, "analysis").open.length).toBeGreaterThan(0);
  });
  it("splits links out of info text and parses keywords", () => {
    expect(linkParts("Kurs: https://lms.example/a. Fertig")).toEqual([
      { text: "Kurs: " }, { text: "https://lms.example/a", href: "https://lms.example/a" }, { text: ". Fertig" },
    ]);
    expect(parseKeywordInput("Mathe, mathe; Analysis\n ")).toEqual(["Mathe", "Analysis"]);
  });
});
