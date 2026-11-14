import { describe, it, expect, vi } from "vitest";
import { parseSetup, request, ApiFailure } from "./api";
const connection = {
  u: "https://script.google.com/macros/s/test-deployment/exec",
  k: "x".repeat(32),
};
describe("setup", () => {
  it("accepts padded base64 and base64url", () => {
    const raw = JSON.stringify(connection);
    expect(parseSetup(btoa(raw))).toEqual(connection);
    expect(
      parseSetup(
        btoa(raw).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
      ),
    ).toEqual(connection);
  });
  it.each([
    "not base64",
    btoa(JSON.stringify({ ...connection, u: "javascript:alert(1)" })),
    btoa(
      JSON.stringify({
        ...connection,
        u: "https://script.google.com/macros/s/test/dev",
      }),
    ),
    btoa(JSON.stringify({ ...connection, k: "short" })),
  ])("rejects invalid setup %s", (code) => {
    expect(() => parseSetup(code)).toThrow();
  });
});
describe("API transport", () => {
  it("uses a simple POST, follows redirects, and keeps the key in the body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: { time: "now" } })),
      );
    await expect(request(connection, "ping", {}, fetcher)).resolves.toEqual({
      time: "now",
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(connection.u);
    expect(options).toMatchObject({
      method: "POST",
      redirect: "follow",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
    });
    expect(JSON.parse(options!.body as string)).toEqual({
      key: connection.k,
      action: "ping",
      payload: {},
    });
  });
  it.each(["unauthorized", "bad_request", "not_found", "busy", "internal"])(
    "recognizes HTTP 200 error %s",
    async (code) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code, message: "server message" },
          }),
        ),
      );
      await expect(
        request(connection, "getState", {}, fetcher),
      ).rejects.toMatchObject({ code });
    },
  );
  it.each([
    "<html>Error</html>",
    "null",
    '{"ok":true}',
    '{"ok":false,"error":{"code":"other"}}',
  ])("rejects malformed envelopes", async (body) => {
    await expect(
      request(connection, "ping", {}, async () => new Response(body)),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("classifies network failures without leaking credentials", async () => {
    await expect(
      request(connection, "ping", {}, async () => {
        throw Error(connection.k);
      }),
    ).rejects.toEqual(
      new ApiFailure(
        "network",
        "Keine Verbindung. Änderungen bleiben auf diesem Gerät gespeichert.",
      ),
    );
  });
});
