import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformation, OAuthClientInformationFull, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { getStoredAuth, saveAuth, type StoredAuth } from "./config.ts";

export class CliOAuthProvider implements OAuthClientProvider {
  private _tokens: OAuthTokens | undefined;
  private _clientInfo: OAuthClientInformationFull | undefined;
  private _codeVerifier: string = "";
  private _serverForCleanup: ReturnType<typeof Bun.serve> | null = null;

  /** Resolves with the auth code when the callback is received */
  authCodePromise: Promise<string> | null = null;
  private _authResolve: ((code: string) => void) | null = null;

  constructor(
    public connectionName: string,
    public callbackPort: number = 8912
  ) {}

  get redirectUrl(): URL {
    return new URL(`http://localhost:${this.callbackPort}/callback`);
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl.toString()],
      client_name: "mcp-to-cli",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    if (this._clientInfo) return this._clientInfo;
    const stored = await getStoredAuth(this.connectionName);
    if (stored?.clientId) {
      return { client_id: stored.clientId, client_secret: stored.clientSecret };
    }
    return undefined;
  }

  async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    this._clientInfo = info;
    const existing = (await getStoredAuth(this.connectionName)) || ({} as StoredAuth);
    await saveAuth(this.connectionName, {
      ...existing,
      clientId: info.client_id,
      clientSecret: info.client_secret,
    });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    if (this._tokens) return this._tokens;
    const stored = await getStoredAuth(this.connectionName);
    if (stored?.accessToken) {
      return {
        access_token: stored.accessToken,
        token_type: stored.tokenType || "Bearer",
        refresh_token: stored.refreshToken,
      };
    }
    return undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this._tokens = tokens;
    const existing = (await getStoredAuth(this.connectionName)) || ({} as StoredAuth);
    await saveAuth(this.connectionName, {
      ...existing,
      accessToken: tokens.access_token,
      tokenType: tokens.token_type,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
    });
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    const open = (await import("open")).default;

    // Start local callback server and expose the promise
    this.authCodePromise = new Promise<string>((resolve) => {
      this._authResolve = resolve;
    });

    const self = this;
    const server = Bun.serve({
      port: this.callbackPort,
      routes: {
        "/callback": {
          GET(req) {
            const url = new URL(req.url);
            const code = url.searchParams.get("code");
            if (code && self._authResolve) {
              self._authResolve(code);
              return new Response(
                "<html><body><h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p></body></html>",
                { headers: { "Content-Type": "text/html" } }
              );
            }
            const error = url.searchParams.get("error");
            return new Response(
              `<html><body><h1>Authorization failed</h1><p>${error || "Missing authorization code"}</p></body></html>`,
              { status: 400, headers: { "Content-Type": "text/html" } }
            );
          },
        },
      },
      fetch(req) {
        return new Response("Not found", { status: 404 });
      },
    });
    this._serverForCleanup = server;

    console.log(`\nOpening browser for authorization...`);
    console.log(`If the browser doesn't open, visit:\n${authorizationUrl.toString()}\n`);
    console.log("Waiting for authorization...");
    await open(authorizationUrl.toString());

    // Don't wait here — return immediately so auth() returns 'REDIRECT'.
    // The caller will await authCodePromise separately.
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    return this._codeVerifier;
  }

  cleanup() {
    if (this._serverForCleanup) {
      this._serverForCleanup.stop();
      this._serverForCleanup = null;
    }
  }
}
