import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile, unlink, access, readdir } from "fs/promises";

const CONFIG_DIR = join(homedir(), ".mcp-to-cli");
const PROFILES_DIR = join(CONFIG_DIR, "profiles");

let _profileOverride: string | undefined;

export function setProfileOverride(name: string): void {
  _profileOverride = name;
}

export function getActiveProfile(): string {
  return _profileOverride || process.env.MCP_CLI_PROFILE || "default";
}

function getProfileDir(profile?: string): string {
  const p = profile ?? getActiveProfile();
  return join(PROFILES_DIR, p);
}

function getConnectionsFile(profile?: string): string {
  return join(getProfileDir(profile), "connections.json");
}

/** Returns ancestor chain from root to current, e.g. "a/b/c" → ["default", "a", "a/b", "a/b/c"] */
function getAncestorChain(profile?: string): string[] {
  const p = profile ?? getActiveProfile();
  const chain: string[] = ["default"];
  if (p === "default") return chain;
  const parts = p.split("/");
  for (let i = 1; i <= parts.length; i++) {
    chain.push(parts.slice(0, i).join("/"));
  }
  return chain;
}

async function readConnectionsFile(profile: string): Promise<StoredConnection[]> {
  const file = getConnectionsFile(profile);
  if (!(await fileExists(file))) return [];
  const data = await readFile(file, "utf-8");
  return JSON.parse(data);
}

function getAuthPathForProfile(connectionName: string, profile: string): string {
  return join(getProfileDir(profile), `auth-${connectionName}.json`);
}

export async function createProfile(name: string): Promise<void> {
  await mkdir(getProfileDir(name), { recursive: true });
}

export async function listProfiles(): Promise<{ name: string; active: boolean }[]> {
  await mkdir(PROFILES_DIR, { recursive: true });
  const active = getActiveProfile();
  try {
    const profiles = await findProfiles(PROFILES_DIR, "");
    if (profiles.length === 0) return [{ name: "default", active: true }];
    return profiles.sort().map((name) => ({ name, active: name === active }));
  } catch {
    return [{ name: "default", active: true }];
  }
}

async function findProfiles(base: string, prefix: string): Promise<string[]> {
  const entries = await readdir(join(base, prefix), { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const files = entries.filter((e) => e.isFile());
  const results: string[] = [];

  if (dirs.length === 0) {
    // Leaf directory — it's a profile
    if (prefix) results.push(prefix);
  } else {
    // Has subdirectories — check if this level is also a profile (has data files)
    if (prefix && files.some((f) => f.name === "connections.json" || f.name.startsWith("auth-"))) {
      results.push(prefix);
    }
    for (const dir of dirs) {
      const child = prefix ? `${prefix}/${dir.name}` : dir.name;
      results.push(...(await findProfiles(base, child)));
    }
  }
  return results;
}

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

async function ensureConfigDir(profile?: string) {
  await mkdir(getProfileDir(profile), { recursive: true });
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
  const chain = getAncestorChain();
  const byName = new Map<string, StoredConnection>();
  for (const profile of chain) {
    for (const conn of await readConnectionsFile(profile)) {
      byName.set(conn.name, conn);
    }
  }
  return [...byName.values()];
}

export async function saveConnections(connections: StoredConnection[]) {
  await ensureConfigDir();
  await writeFile(getConnectionsFile(), JSON.stringify(connections, null, 2));
}

export async function getConnection(name: string): Promise<StoredConnection | undefined> {
  const connections = await getConnections();
  return connections.find((c) => c.name === name);
}

export async function addConnection(connection: StoredConnection) {
  const connections = await readConnectionsFile(getActiveProfile());
  const existing = connections.findIndex((c) => c.name === connection.name);
  if (existing >= 0) {
    connections[existing] = connection;
  } else {
    connections.push(connection);
  }
  await saveConnections(connections);
}

export async function removeConnection(name: string): Promise<boolean> {
  const connections = await readConnectionsFile(getActiveProfile());
  const filtered = connections.filter((c) => c.name !== name);
  if (filtered.length === connections.length) return false;
  await saveConnections(filtered);
  // Also remove auth file from current profile
  const authPath = getAuthPathForProfile(name, getActiveProfile());
  if (await fileExists(authPath)) {
    await unlink(authPath);
  }
  return true;
}

export async function getStoredAuth(name: string): Promise<StoredAuth | undefined> {
  await ensureConfigDir();
  // Walk ancestor chain from most specific to least specific
  const chain = getAncestorChain().reverse();
  for (const profile of chain) {
    const authPath = getAuthPathForProfile(name, profile);
    if (await fileExists(authPath)) {
      const data = await readFile(authPath, "utf-8");
      return JSON.parse(data);
    }
  }
  return undefined;
}

export async function saveAuth(name: string, auth: StoredAuth) {
  await ensureConfigDir();
  await writeFile(getAuthPathForProfile(name, getActiveProfile()), JSON.stringify(auth, null, 2));
}

export { CONFIG_DIR };
