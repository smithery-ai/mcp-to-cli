# mcp-to-cli

`mcp-to-cli` is a Bun-based command-line client for connecting to remote Model Context Protocol (MCP) servers, saving named connections, and interacting with server tools, resources, and prompts from a terminal.

## What it does

- Connects to remote MCP servers over Streamable HTTP, with SSE fallback.
- Stores named connections locally so you can address a server by name.
- Supports OAuth browser authorization flows for protected servers.
- Lists tool, resource, and prompt capabilities exposed by a server.
- Validates tool arguments locally against each tool's input schema before sending the call.
- Calls tools interactively or with JSON arguments from the command line.

## Requirements

- Bun 1.3+
- A reachable MCP server URL
- `NGROK_AUTHTOKEN` in your environment when using `--ngrok`

## Install

```bash
bun install
```

## Local development

```bash
bun start
```

Watch mode:

```bash
bun dev
```

## Quality checks

The repository uses Oxc tooling for linting and formatting:

- `bun fmt` formats the codebase with `oxfmt` and applies autofixable `oxlint` changes.
- `bun check` verifies formatting, fails on lint warnings, and runs TypeScript type-checking.

Useful individual commands:

```bash
bun run lint
bun run fmt:check
bun run typecheck
```

## CLI usage

Top-level help:

```bash
bun start --help
```

### Save a connection

```bash
mcp-to-cli connect https://example.com/mcp --name example
```

Use ngrok for OAuth callbacks:

```bash
mcp-to-cli connect https://example.com/mcp --name example --ngrok
```

Equivalent command:

```bash
mcp-to-cli connections add https://example.com/mcp --name example
```

If `--name` is omitted, the CLI derives a name from the server hostname.

### List saved connections

```bash
mcp-to-cli connections list
```

### Remove a saved connection

```bash
mcp-to-cli connections remove example
```

## Working with a saved server

After a server is saved, address it by connection name:

```bash
mcp-to-cli <connection> <category> <command>
```

Supported categories:

- `tools`
- `resources`
- `prompts`

### Tools

List available tools:

```bash
mcp-to-cli example tools list
```

Paginate and show full descriptions:

```bash
mcp-to-cli example tools list --offset 0 --limit 10 --full-description
```

Inspect a tool schema:

```bash
mcp-to-cli example tools get search_docs
```

Call a tool interactively:

```bash
mcp-to-cli example tools call search_docs
```

Call a tool with JSON arguments:

```bash
mcp-to-cli example tools call search_docs --args '{"query":"oauth"}'
```

Return raw JSON output:

```bash
mcp-to-cli example tools call search_docs --args '{"query":"oauth"}' --json
```

### Resources

List resources:

```bash
mcp-to-cli example resources list
```

Read a resource:

```bash
mcp-to-cli example resources get file:///docs/intro.md
```

### Prompts

List prompts:

```bash
mcp-to-cli example prompts list
```

Render a prompt:

```bash
mcp-to-cli example prompts get summarize_release
```

## OAuth flow

For servers that require OAuth:

1. The CLI opens the system browser.
2. It listens on a shared local callback server at `http://localhost:8912/<connection>/callback`.
3. If the connection was created with `--ngrok`, the redirect URI uses the ngrok URL for that same callback path instead of localhost.
4. After approval, tokens are stored for the saved connection and reused on future requests.

## Local data

Saved connection metadata and auth state are stored under:

```text
~/.mcp-to-cli/
```

That directory contains:

- `connections.json` for saved servers
- `auth-<name>.json` for per-connection OAuth state

## Project structure

```text
src/cli.ts      Command parsing and user-facing CLI flows
src/client.ts   MCP client creation, transport fallback, auth retry logic
src/auth.ts     OAuth provider and local callback server
src/config.ts   Local storage for saved connections and auth state
index.ts        Re-exports for library-style imports
```

## Continuous integration

GitHub Actions runs the same checks used locally on pushes and pull requests to `main`:

- formatting check
- lint with warnings treated as failures
- TypeScript type-checking
