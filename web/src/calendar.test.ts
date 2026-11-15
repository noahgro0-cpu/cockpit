import { describe, it, expect } from "vitest";
import { day, nextDays, monthDays, monthShift } from "./date";

describe("calendar windows", () => {
  it.each([
    "2026-03-28T23:30:00Z",
    "2026-10-24T23:30:00Z",
    "2026-12-31T23:30:00Z",
  ])("starts today in Zurich across DST and year boundaries: %s", (value) => {
    const now = new Date(value);
    const days = nextDays(now);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe(day(now));
    for (let i = 1; i < days.length; i++)
      expect(Date.parse(days[i]) - Date.parse(days[i - 1])).toBe(86400000);
  });
  it.each(["2026-02-01", "2026-03-01", "2026-10-01", "2028-02-01"])(
    "builds complete Monday-Sunday rows for %s",
    (month) => {
      const days = monthDays(month);
      expect(days.length % 7).toBe(0);
      expect(new Date(days[0]).getUTCDay()).toBe(1);
      expect(new Date(days.at(-1)!).getUTCDay()).toBe(0);
      expect(days).toContain(month);
      expect(new Set(days).size).toBe(days.length);
    },
  );
  it("includes leap day and shifts across the year without end-of-month overflow", () => {
    expect(monthDays("2028-02-01")).toContain("2028-02-29");
    expect(monthShift("2026-12-31", 1)).toBe("2027-01-01");
    expect(monthShift("2027-01-01", -1)).toBe("2026-12-01");
  });
});
