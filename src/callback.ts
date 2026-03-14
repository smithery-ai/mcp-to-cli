import { createServer, type Server } from "http";

const CALLBACK_PORT = 8912;

type CallbackRegistration = {
  reject: (error: Error) => void;
  resolve: (code: string) => void;
};

let callbackServer: Server | null = null;
const callbacks = new Map<string, CallbackRegistration>();

function successHtml() {
  return "<html><body><h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p></body></html>";
}

function errorHtml(message: string) {
  return `<html><body><h1>Authorization failed</h1><p>${message}</p></body></html>`;
}

function stopCallbackServerIfIdle() {
  if (callbacks.size === 0 && callbackServer) {
    callbackServer.close();
    callbackServer = null;
  }
}

function ensureCallbackServer() {
  if (callbackServer) return callbackServer;

  callbackServer = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${CALLBACK_PORT}`);
    const callback = callbacks.get(url.pathname);
    if (!callback) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const code = url.searchParams.get("code");
    if (code) {
      callbacks.delete(url.pathname);
      stopCallbackServerIfIdle();
      callback.resolve(code);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(successHtml());
      return;
    }

    const error = url.searchParams.get("error") ?? "Missing authorization code";
    callbacks.delete(url.pathname);
    stopCallbackServerIfIdle();
    callback.reject(new Error(`Authorization failed: ${error}`));
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(errorHtml(error));
  });

  callbackServer.listen(CALLBACK_PORT);
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
