---
name: mcp-cli
description: How to use the mcp-to-cli command-line tool to connect to remote MCP servers and interact with their tools, resources, and prompts. Use this skill whenever the user wants to connect to an MCP server from the terminal, call MCP tools via CLI, manage MCP connections, list or invoke tools/resources/prompts on a remote server, or debug MCP server interactions. Also use this when the user mentions "mcp-to-cli", asks about CLI-based MCP workflows, or wants to script MCP tool calls.
---

# mcp-to-cli

`mcp-to-cli` is a Bun-based CLI client that lets you connect to remote MCP (Model Context Protocol) servers and interact with their tools, resources, and prompts directly from the terminal.

## Important: Auth URLs

When this CLI triggers an OAuth flow, it opens a browser automatically. **If you are an AI agent using this skill, always pass `--no-open` when connecting** so the auth URL is printed to the terminal instead of opening a browser. Relay the printed URL to the user and ask them to visit it. The CLI listens on a local callback server at `http://localhost:8912/<connection>/callback` for the OAuth redirect, so the user just needs to complete auth in their browser and it will be captured automatically.

## Installation

```bash
bun install
```

## Requirements

- Bun 1.3+
- A reachable MCP server URL
- `NGROK_AUTHTOKEN` in your environment when using `--ngrok`

## URL Shortcuts

If you pass a bare name (no `://` or `.`), the CLI resolves it to `https://<name>.run.tools` (Smithery):

```bash
# These are equivalent:
mcp-to-cli connect linear
mcp-to-cli connect https://linear.run.tools

# Works for any service on Smithery:
mcp-to-cli connect notion    # → https://notion.run.tools
mcp-to-cli connect gmail     # → https://gmail.run.tools
```

When a shortcut is used, the CLI logs `Defaulting to Smithery URL: <resolved-url>`.

## Quick Start

```bash
# Connect to an MCP server (this saves the connection for future use)
mcp-to-cli connect https://mcp.notion.com/mcp --name notion

# Connect without opening a browser (prints the auth URL instead)
mcp-to-cli connect https://mcp.notion.com/mcp --name notion --no-open

# List available tools
mcp-to-cli notion tools list

# Call a tool interactively
mcp-to-cli notion tools call search

# Call a tool with arguments directly
mcp-to-cli notion tools call search --args '{"query": "meeting notes"}'
```

## Commands

### Connection Management

```bash
# Connect and save (shorthand)
mcp-to-cli connect <url> [--name <name>] [--ngrok] [--no-open]

# Manage connections
mcp-to-cli connections add <url> [--name <name>] [--ngrok] [--no-open]
mcp-to-cli connections list          # or: connections ls
mcp-to-cli connections remove <name> # or: connections rm
```

If `--name` is omitted, the CLI extracts a name from the URL hostname (e.g., `https://mcp.notion.com/mcp` becomes `notion`).

Connections are stored in `~/.mcp-to-cli/profiles/<profile>/connections.json`.

### Profiles

```bash
# Create a profile
mcp-to-cli profile create <name>

# List all profiles
mcp-to-cli profile list   # or: profile ls

# Use a profile with any command
mcp-to-cli --profile <name> <command>   # or: -p <name>

# Or set via environment variable
export MCP_CLI_PROFILE=<name>
```

Profiles can be nested (e.g., `acme/staging`). Child profiles inherit connections and auth from parents — the lookup chain for `acme/staging` is `default → acme → acme/staging`. Writes always target the current profile only.

Resolution order: `--profile` flag > `MCP_CLI_PROFILE` env > `"default"`.

### Tools

```bash
# List tools (paginated, 5 per page by default)
mcp-to-cli <connection> tools list [--offset N] [--limit N] [--full-description]

# Show a tool's input schema
mcp-to-cli <connection> tools get <tool_name>

# Call a tool
mcp-to-cli <connection> tools call <tool_name> [--args '{...}'] [--json]
```

- **Interactive mode** (default): If you omit `--args`, the CLI prompts you for each argument based on the tool's JSON schema. Required fields are marked with `*`. Press Enter to skip optional fields.
- **Scripted mode**: Pass `--args '{"key": "value"}'` for non-interactive use.
- **JSON output**: Add `--json` to get the raw MCP response (useful for piping/scripting). Without `--json`, output is truncated at 80 lines.
- **Pagination**: Tools are sorted alphabetically. Use `--offset` and `--limit` to page through large lists.

### Resources

```bash
# List available resources
mcp-to-cli <connection> resources list   # or: resources ls

# Read a resource by URI
mcp-to-cli <connection> resources get <uri>   # or: resources read
```

### Prompts

```bash
# List available prompts
mcp-to-cli <connection> prompts list   # or: prompts ls

# Render a prompt (prompts interactively for arguments)
mcp-to-cli <connection> prompts get <prompt_name>
```

## Authentication

The CLI supports OAuth 2.0 with PKCE. When a server requires authentication:

1. The CLI detects the `UnauthorizedError` and starts an OAuth flow
2. By default it opens your browser to the authorization URL. Pass `--no-open` to print the URL instead.
3. A shared local callback server listens on `http://localhost:8912/<connection>/callback`
4. After you authorize in the browser, the CLI exchanges the code for tokens
5. Tokens are saved to `~/.mcp-to-cli/profiles/<profile>/auth-<connection-name>.json` and reused automatically
6. The `--no-open` preference is saved with the connection and used automatically on future requests

If the browser doesn't open automatically, the CLI prints the authorization URL to the terminal — copy and paste it into your browser.

### ngrok support

If the MCP server's OAuth provider doesn't allow `localhost` redirect URIs, use `--ngrok` when connecting:

```bash
mcp-to-cli connect https://example.com/mcp --name example --ngrok
```

This starts an ngrok tunnel that exposes the local callback server with a public URL. The `--ngrok` preference is saved with the connection and used automatically on future requests.

Requires `NGROK_AUTHTOKEN` in your environment and the `@ngrok/ngrok` package installed.

## Transport

The CLI tries Streamable HTTP transport first, then falls back to SSE (Server-Sent Events) if that fails. This is automatic and requires no configuration.

## Help

Every level of the CLI supports `--help`:

```bash
mcp-to-cli --help
mcp-to-cli <connection> --help
mcp-to-cli <connection> tools --help
mcp-to-cli <connection> tools call --help
```

## Configuration Files

All config lives in `~/.mcp-to-cli/profiles/<profile>/`:

| File               | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `connections.json` | Saved server connections (name, URL, timestamp) |
| `auth-<name>.json` | OAuth tokens for each connection                |

Profiles are directories under `~/.mcp-to-cli/profiles/`. The default profile is `default`. Child profiles (e.g., `acme/staging`) inherit from parents.

## Running in Development

```bash
bun start        # Run once
bun dev          # Watch mode (auto-restart on changes)
```

## Example Workflow

```bash
# 1. Connect to Notion's MCP server
mcp-to-cli connect https://mcp.notion.com/mcp --name notion --no-open
# (Auth URL is printed — open it in your browser to authorize)

# 2. Explore available tools
mcp-to-cli notion tools list
mcp-to-cli notion tools list --offset 5  # next page

# 3. Inspect a specific tool
mcp-to-cli notion tools get notion_search

# 4. Call it
mcp-to-cli notion tools call notion_search --args '{"query": "Q1 planning"}'

# 5. Get raw JSON for scripting
mcp-to-cli notion tools call notion_search --args '{"query": "Q1 planning"}' --json
```
