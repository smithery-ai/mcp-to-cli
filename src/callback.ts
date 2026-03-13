const CALLBACK_PORT = 8912;

type CallbackRegistration = {
  reject: (error: Error) => void;
  resolve: (code: string) => void;
};

let callbackServer: ReturnType<typeof Bun.serve> | null = null;
const callbacks = new Map<string, CallbackRegistration>();

function successHtml() {
  return new Response(
    "<html><body><h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p></body></html>",
    { headers: { "Content-Type": "text/html" } },
  );
}

function errorHtml(message: string) {
  return new Response(`<html><body><h1>Authorization failed</h1><p>${message}</p></body></html>`, {
    status: 400,
    headers: { "Content-Type": "text/html" },
  });
}

function stopCallbackServerIfIdle() {
  if (callbacks.size === 0 && callbackServer) {
    callbackServer.stop();
    callbackServer = null;
  }
}

function ensureCallbackServer() {
  if (callbackServer) return callbackServer;

  callbackServer = Bun.serve({
    port: CALLBACK_PORT,
    fetch(req) {
      const url = new URL(req.url);
      const callback = callbacks.get(url.pathname);
      if (!callback) {
        return new Response("Not found", { status: 404 });
      }

      const code = url.searchParams.get("code");
      if (code) {
        callbacks.delete(url.pathname);
        stopCallbackServerIfIdle();
        callback.resolve(code);
        return successHtml();
      }

      const error = url.searchParams.get("error") ?? "Missing authorization code";
      callbacks.delete(url.pathname);
      stopCallbackServerIfIdle();
      callback.reject(new Error(`Authorization failed: ${error}`));
      return errorHtml(error);
    },
  });

  return callbackServer;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "server";
}

export function createCallbackPath(connectionName: string, serverUrl: string): string {
  const parsed = new URL(serverUrl);
  const hostname = slugify(parsed.hostname);
  const pathname = parsed.pathname === "/" ? "" : `-${slugify(parsed.pathname)}`;
  return `/${slugify(connectionName)}-${hostname}${pathname}/callback`;
}

export function getLocalCallbackBaseUrl(): string {
  return `http://localhost:${CALLBACK_PORT}`;
}

export function registerCallback(path: string, registration: CallbackRegistration) {
  ensureCallbackServer();

  if (callbacks.has(path)) {
    throw new Error(`Authorization is already in progress for callback path "${path}".`);
  }

  callbacks.set(path, registration);

  return () => {
    callbacks.delete(path);
    stopCallbackServerIfIdle();
  };
}

export { CALLBACK_PORT };
