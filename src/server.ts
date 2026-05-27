import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (
    request: Request,
    env?: unknown,
    ctx?: unknown
  ) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | null = null;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m: any) => m.default || m
    );
  }

  return serverEntryPromise;
}

function brandedErrorResponse(error?: unknown): Response {
  console.error("SSR Error:", error);

  return new Response(renderErrorPage(), {
    status: 500,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function isCatastrophicSsrErrorBody(
  body: string,
  responseStatus: number
): boolean {
  try {
    const payload = JSON.parse(body);

    if (
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload)
    ) {
      const fields = payload as Record<string, unknown>;

      return (
        fields.unhandled === true &&
        fields.message === "HTTPError" &&
        (fields.status === undefined ||
          fields.status === responseStatus)
      );
    }

    return false;
  } catch {
    return false;
  }
}

async function normalizeCatastrophicSsrResponse(
  response: Response
): Promise<Response> {
  try {
    if (response.status < 500) {
      return response;
    }

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      return response;
    }

    const body = await response.clone().text();

    if (
      !isCatastrophicSsrErrorBody(body, response.status)
    ) {
      return response;
    }

    console.error(
      consumeLastCapturedError() ||
        new Error(`SSR Error: ${body}`)
    );

    return brandedErrorResponse();
  } catch (error) {
    console.error(error);
    return brandedErrorResponse(error);
  }
}

const server = {
  async fetch(
    request: Request,
    env?: unknown,
    ctx?: unknown
  ): Promise<Response> {
    try {
      const handler = await getServerEntry();

      if (!handler || typeof handler.fetch !== "function") {
        throw new Error("Invalid server entry handler");
      }

      const response = await handler.fetch(
        request,
        env,
        ctx
      );

      return await normalizeCatastrophicSsrResponse(
        response
      );
    } catch (error) {
      console.error("Fetch Error:", error);

      return brandedErrorResponse(error);
    }
  },
};

export default server;
