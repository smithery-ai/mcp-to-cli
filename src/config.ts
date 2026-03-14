import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile, unlink, access } from "fs/promises";

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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function getConnections(): Promise<StoredConnection[]> {
  await ensureConfigDir();
  if (!(await fileExists(CONNECTIONS_FILE))) return [];
  const data = await readFile(CONNECTIONS_FILE, "utf-8");
  return JSON.parse(data);
}

export async function saveConnections(connections: StoredConnection[]) {
  await ensureConfigDir();
  await writeFile(CONNECTIONS_FILE, JSON.stringify(connections, null, 2));
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
  if (await fileExists(getAuthPath(name))) {
    await unlink(getAuthPath(name));
  }
  return true;
}

function getAuthPath(name: string): string {
  return join(CONFIG_DIR, `auth-${name}.json`);
}

export async function getStoredAuth(name: string): Promise<StoredAuth | undefined> {
  await ensureConfigDir();
  const authPath = getAuthPath(name);
  if (!(await fileExists(authPath))) return undefined;
  const data = await readFile(authPath, "utf-8");
  return JSON.parse(data);
}

export async function saveAuth(name: string, auth: StoredAuth) {
  await ensureConfigDir();
  await writeFile(getAuthPath(name), JSON.stringify(auth, null, 2));
}

export { CONFIG_DIR };
