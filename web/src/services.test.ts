import { describe, it, expect } from "vitest";
import type { State } from "../../shared/api-types";
import mock from "../../docs/mock-state.json";
import {
  travelPlan,
  chooseConnection,
  type ConnectionResult,
} from "./services";
import { capture } from "./model";
const state = mock as State;
describe("commuting", () => {
  it("targets an arrival ten minutes before the first lesson", () => {
    expect(
      travelPlan(state.events, state.settings, new Date(state.generatedAt))
        ?.arrival,
    ).toBe("2026-11-16T07:05:00.000Z");
  });
  it("reverses direction after the last lesson", () => {
    expect(
      travelPlan(
        state.events,
        state.settings,
        new Date("2026-11-16T12:00:00+01:00"),
      ),
    ).toEqual({ from: state.settings.campusStop, to: state.settings.homeStop });
  });
  it("does not query during lessons or on non-teaching days", () => {
    expect(
      travelPlan(
        state.events,
        state.settings,
        new Date("2026-11-16T09:00:00+01:00"),
      ),
    ).toBeNull();
    expect(
      travelPlan(
        state.events,
        state.settings,
        new Date("2026-11-21T07:00:00+01:00"),
      ),
    ).toBeNull();
  });
  it("excludes departed and late-arriving connections", () => {
    const plan = travelPlan(
      state.events,
      state.settings,
      new Date(state.generatedAt),
    )!;
    const connection = (
      departure: string,
      arrival: string,
    ): ConnectionResult => ({
      from: { departure, arrival: null, delay: 0, platform: "2" },
      to: { departure: null, arrival, delay: 0, platform: "1" },
      products: ["S1"],
      transfers: 0,
    });
    const valid = connection(
      "2026-11-16T07:24:00+01:00",
      "2026-11-16T08:02:00+01:00",
    );
    expect(
      chooseConnection(
        [
          connection("2026-11-16T07:00:00+01:00", "2026-11-16T08:00:00+01:00"),
          valid,
          connection("2026-11-16T07:30:00+01:00", "2026-11-16T08:10:00+01:00"),
        ],
        plan,
        new Date(state.generatedAt),
      ),
    ).toEqual(valid);
  });
});
describe("quick capture", () => {
  it("previews a German date in Zurich", () => {
    expect(
      capture("morgen Buch zurückgeben", new Date(state.generatedAt)).due,
    ).toBe("2026-11-17");
  });
  it("preserves a title without a date", () => {
    expect(capture("Buch zurückgeben", new Date(state.generatedAt))).toEqual({
      title: "Buch zurückgeben",
    });
  });
  it("parses a time with the right DST offset", () => {
    expect(
      capture("morgen um 14 Uhr lernen", new Date("2026-03-28T12:00:00Z")).due,
    ).toBe("2026-03-29T12:00:00.000Z");
  });
});
