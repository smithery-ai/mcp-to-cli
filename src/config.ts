import { homedir } from "os";
import { join } from "path";
import { mkdir } from "fs/promises";

const CONFIG_DIR = join(homedir(), ".mcp-to-cli");
const CONNECTIONS_FILE = join(CONFIG_DIR, "connections.json");

export interface StoredConnection {
  name: string;
  url: string;
  addedAt: string;
  useNgrok?: boolean;
  noOpen?: boolean;
}

export interface StoredAuth {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: number;
  codeVerifier?: string;
  redirectUri?: string;
}

async function ensureConfigDir() {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function getConnections(): Promise<StoredConnection[]> {
  await ensureConfigDir();
  const file = Bun.file(CONNECTIONS_FILE);
  if (!(await file.exists())) return [];
  return file.json();
}

export async function saveConnections(connections: StoredConnection[]) {
  await ensureConfigDir();
  await Bun.write(CONNECTIONS_FILE, JSON.stringify(connections, null, 2));
}

export async function getConnection(name: string): Promise<StoredConnection | undefined> {
  const connections = await getConnections();
  return connections.find((c) => c.name === name);
}

export async function addConnection(connection: StoredConnection) {
  const connections = await getConnections();
  const existing = connections.findIndex((c) => c.name === connection.name);
  if (existing >= 0) {
    connections[existing] = connection;
  } else {
    connections.push(connection);
  }
  await saveConnections(connections);
}

export async function removeConnection(name: string): Promise<boolean> {
  const connections = await getConnections();
  const filtered = connections.filter((c) => c.name !== name);
  if (filtered.length === connections.length) return false;
  await saveConnections(filtered);
  // Also remove auth file
  const authFile = Bun.file(getAuthPath(name));
  if (await authFile.exists()) {
    const { unlink } = await import("fs/promises");
    await unlink(getAuthPath(name));
  }
  return true;
}

function getAuthPath(name: string): string {
  return join(CONFIG_DIR, `auth-${name}.json`);
}

export async function getStoredAuth(name: string): Promise<StoredAuth | undefined> {
  await ensureConfigDir();
  const file = Bun.file(getAuthPath(name));
  if (!(await file.exists())) return undefined;
  return file.json();
}

export async function saveAuth(name: string, auth: StoredAuth) {
  await ensureConfigDir();
  await Bun.write(getAuthPath(name), JSON.stringify(auth, null, 2));
}

export { CONFIG_DIR };
