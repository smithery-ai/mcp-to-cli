import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { CliOAuthProvider } from "./auth.ts";
import { getConnection } from "./config.ts";

async function connectWithAuth(url: string, authProvider: CliOAuthProvider): Promise<Client> {
  const client = new Client({ name: "mcp-to-cli", version: "1.0.0" });
  const serverUrl = new URL(url);

  // Try Streamable HTTP first, fall back to SSE
  const transports = [
    () => new StreamableHTTPClientTransport(serverUrl, { authProvider }),
    () => new SSEClientTransport(serverUrl, { authProvider }),
  ];

  let lastError: Error | undefined;

  for (const createTransport of transports) {
    try {
      const transport = createTransport();
      await client.connect(transport);
      await authProvider.cleanup();
      return client;
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        // Auth flow was triggered — redirectToAuthorization was called,
        // browser opened, callback server started. Wait for the code.
        if (!authProvider.authCodePromise) {
          throw new Error("OAuth flow started but no callback server. This shouldn't happen.");
        }

        console.log("Waiting for browser authorization...");
        try {
          const code = await authProvider.authCodePromise;
          console.log("Authorization code received! Exchanging for tokens...\n");

          // Exchange the code for tokens
          const authResult = await auth(authProvider, {
            serverUrl,
            authorizationCode: code,
          });

          if (authResult !== "AUTHORIZED") {
            throw new Error("Failed to exchange authorization code for tokens.");
          }

          // Now retry connection with tokens
          const retryTransport = createTransport();
          const retryClient = new Client({ name: "mcp-to-cli", version: "1.0.0" });
          await retryClient.connect(retryTransport);
          return retryClient;
        } finally {
          await authProvider.cleanup();
        }
      }
      lastError = e as Error;
      // Try next transport
    }
  }

  throw new Error(`Failed to connect to ${url}: ${lastError?.message}`);
}

export async function createClient(name: string): Promise<Client> {
  const connection = await getConnection(name);
  if (!connection) {
    throw new Error(`Connection "${name}" not found. Run: mcp-to-cli connect <url> --name ${name}`);
  }

  const authProvider = new CliOAuthProvider(name, connection.url, connection.useNgrok, connection.noOpen);

  try {
    return await connectWithAuth(connection.url, authProvider);
  } catch (e) {
    await authProvider.cleanup();
    throw e;
  }
}

export async function connectAndSave(
  url: string,
  name: string,
  useNgrok: boolean = false,
  noOpen: boolean = false,
): Promise<Client> {
  const authProvider = new CliOAuthProvider(name, url, useNgrok, noOpen);

  try {
    return await connectWithAuth(url, authProvider);
  } catch (e) {
    await authProvider.cleanup();
    throw e;
  }
}
