import type {
  ApiAction,
  ApiActions,
  ApiErrorCode,
  ApiRequest,
  ApiResponse,
} from "../../shared/api-types";
export interface Connection {
  u: string;
  k: string;
}
export class ApiFailure extends Error {
  constructor(
    public code: ApiErrorCode | "network" | "invalid_response",
    message: string,
  ) {
    super(message);
  }
}
export function parseSetup(code: string): Connection {
  try {
    const raw = code.trim().replace(/-/g, "+").replace(/_/g, "/");
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("u" in parsed) ||
      !("k" in parsed) ||
      typeof parsed.u !== "string" ||
      typeof parsed.k !== "string" ||
      parsed.k.length < 32
    )
      throw Error();
    const url = new URL(parsed.u);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "script.google.com" ||
      !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw Error();
    return { u: url.href, k: parsed.k };
  } catch {
    throw new Error(
      "Ungültiger Setup-Code. Bitte den vollständigen Code aus dem Sheet einfügen.",
    );
  }
}
export async function request<A extends ApiAction>(
  connection: Connection,
  action: A,
  payload: ApiActions[A]["payload"],
  fetcher: typeof fetch = fetch,
): Promise<ApiActions[A]["data"]> {
  let response: Response;
  const body: ApiRequest<A> = {
    key: connection.k,
    action,
    payload: payload ?? {},
  };
  try {
    response = await fetcher(connection.u, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new ApiFailure(
      "network",
      "Keine Verbindung. Änderungen bleiben auf diesem Gerät gespeichert.",
    );
  }
  if (!response.ok)
    throw new ApiFailure(
      "network",
      "Der Server ist vorübergehend nicht erreichbar.",
    );
  let result: ApiResponse<ApiActions[A]["data"]>;
  try {
    result = await response.json();
  } catch {
    throw new ApiFailure(
      "invalid_response",
      "Die Antwort ist kein JSON. Web-App-Deployment prüfen.",
    );
  }
  if (!result || typeof result !== "object" || typeof result.ok !== "boolean")
    throw new ApiFailure("invalid_response", "Unerwartetes Antwortformat.");
  if (result.ok) {
    if (!("data" in result))
      throw new ApiFailure("invalid_response", "Antwort ohne Daten.");
    return result.data;
  }
  if (
    !result.error ||
    !["unauthorized", "bad_request", "not_found", "busy", "internal"].includes(
      result.error.code,
    ) ||
    typeof result.error.message !== "string"
  )
    throw new ApiFailure("invalid_response", "Ungültiges Fehlerformat.");
  throw new ApiFailure(
    result.error.code,
    result.error.code === "unauthorized"
      ? "Verbindung nicht autorisiert. Setup-Code neu einrichten."
      : result.error.code === "busy"
        ? "Backend beschäftigt. Erneuter Versuch folgt."
        : result.error.code === "not_found"
          ? "Eintrag nicht mehr vorhanden. Serverstand wird übernommen."
          : result.error.code === "bad_request"
            ? "Änderung wurde vom Backend abgelehnt."
            : "Backend-Fehler. Erneuter Versuch folgt.",
  );
}
