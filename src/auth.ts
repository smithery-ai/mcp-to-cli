import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { getStoredAuth, saveAuth, type StoredAuth } from "./config.ts";
import { createCallbackPath, getLocalCallbackBaseUrl, registerCallback } from "./callback.ts";

type NgrokListener = {
  close(): Promise<void>;
  url(): string | null;
};

export class CliOAuthProvider implements OAuthClientProvider {
  private _tokens: OAuthTokens | undefined;
  private _clientInfo: OAuthClientInformationFull | undefined;
  private _codeVerifier: string = "";
  private _authCleanup: (() => void) | null = null;
  private _authReject: ((error: Error) => void) | null = null;
  private _ngrokListener: NgrokListener | null = null;
  private _lastRedirectUri: string | null = null;
  private _ngrokUrl: string | null = null;
  private _prepared = false;
  private readonly _callbackPath: string;

  /** Resolves with the auth code when the callback is received */
  authCodePromise: Promise<string> | null = null;
  private _authResolve: ((code: string) => void) | null = null;

  constructor(
    public connectionName: string,
    serverUrl: string,
    private useNgrok: boolean = false,
    private noOpen: boolean = false,
  ) {
    this._callbackPath = createCallbackPath(connectionName, serverUrl);
    if (!this.useNgrok) {
      this._lastRedirectUri = new URL(this._callbackPath, getLocalCallbackBaseUrl()).toString();
    }
  }

  get redirectUrl(): URL {
    if (!this._lastRedirectUri) {
      throw new Error("OAuth redirect URL requested before the callback was initialized.");
    }

    return new URL(this._lastRedirectUri);
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
    if (this.useNgrok && !this._prepared) {
      await this.prepareRedirectUrl();
    }
    if (this._clientInfo) return this._clientInfo;

    const stored = await getStoredAuth(this.connectionName);
    if (stored?.redirectUri && !this.useNgrok) {
      this._lastRedirectUri = stored.redirectUri;
    }
    if (
      stored?.clientId &&
      (!stored.redirectUri || stored.redirectUri === this.redirectUrl.toString())
    ) {
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
      redirectUri: this.redirectUrl.toString(),
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
      redirectUri: this.redirectUrl.toString(),
    });
  }

  async prepareRedirectUrl(): Promise<void> {
    if (this._prepared) return;
    this._prepared = true;

    if (!this.useNgrok) return;

    try {
      const ngrok = await import("@ngrok/ngrok");
      this._ngrokListener = await ngrok.forward({
        addr: getLocalCallbackBaseUrl().replace("http://", ""),
        authtoken_from_env: true,
      });
      this._ngrokUrl = this._ngrokListener.url();
      if (!this._ngrokUrl) {
        throw new Error("ngrok did not return a public URL.");
      }
      this._lastRedirectUri = new URL(this._callbackPath, this._ngrokUrl).toString();
    } catch (error) {
      this._prepared = false;
      this._ngrokUrl = null;
      throw new Error(
        `Failed to start ngrok. Set NGROK_AUTHTOKEN and try again. ${(error as Error).message}`,
      );
    }
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    await this.prepareRedirectUrl();

    // Register a callback route on the shared server and expose the promise.
    this.authCodePromise = new Promise<string>((resolve, reject) => {
      this._authResolve = resolve;
      this._authReject = reject;
    });

    this._authCleanup = registerCallback(this._callbackPath, {
      reject: (error) => {
        this._authReject?.(error);
      },
      resolve: (code) => {
        this._authResolve?.(code);
      },
    });

    console.log(`\nOAuth callback URL: ${this.redirectUrl.toString()}`);
    if (this.noOpen) {
      console.log(`\nOpen this URL to authorize:\n${authorizationUrl.toString()}\n`);
      console.log("Waiting for authorization...");
    } else {
      const open = (await import("open")).default;
      console.log(`Opening browser for authorization...`);
      console.log(`If the browser doesn't open, visit:\n${authorizationUrl.toString()}\n`);
      console.log("Waiting for authorization...");
      await open(authorizationUrl.toString());
    }

    // Don't wait here — return immediately so auth() returns 'REDIRECT'.
    // The caller will await authCodePromise separately.
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    return this._codeVerifier;
  }

  async cleanup() {
    this._authCleanup?.();
    this._authCleanup = null;
    this._authResolve = null;
    this._authReject = null;
    this.authCodePromise = null;

    if (this._ngrokListener) {
      await this._ngrokListener.close();
      this._ngrokListener = null;
    }

    this._ngrokUrl = null;
    this._prepared = false;
  }
}
