<center><img src="./image.png" alt="mcp-to-cli" style="max-width: 500px;" /></center>

# mcp-to-cli

MCP servers are great for universal compatibility with agents, but for every coding agent you use, you have to re-connect to each server. Also, if your coding agent doesn't have a good harness for tool search, your MCP servers can unnecessarily eat up a ton of context.



`mcp-to-cli` fixes this. It's a **fully local** command-line client that saves named connections to remote MCP servers in one place (`~/.mcp-to-cli/`). Connect once, use everywhere — any tool that can shell out to a CLI can call MCP tools through it.

## Quick start

Run directly with npx:

```bash
npx mcp-to-cli@latest
```

Or install as a skill:
```bash
npx skills add smithery-ai/mcp-to-cli
claude "use /mcp-cli to connect to https://mcp.deepwiki.com/mcp and tell me about browserbase/stagehand"
```

## Use direct CLI

```bash
# Install globally
npm i -g mcp-to-cli

# Connect to a server 
#   (opens browser for OAuth, or ngrok URL for remote setups like OpenClaw)
mcp connect https://mcp.deepwiki.com/mcp --name deepwiki --ngrok

# List what tools are available
mcp deepwiki tools list

# Call a tool (args are validated locally with Zod before sending)
mcp deepwiki tools call ask_question --args '{"repoName":"browserbase/stagehand", "question": "What does this do?"}'
```

## What it does

- Connects to remote MCP servers over Streamable HTTP, with SSE fallback.
- Stores named connections locally so you can address a server by name.
- Supports OAuth browser authorization flows for protected servers.
- Lists tool, resource, and prompt capabilities exposed by a server.
- Validates tool arguments locally against each tool's input schema before sending the call.
- Calls tools interactively or with JSON arguments from the command line.
- MCP URLs can be safely guessed via [run.tools](https://run.tools) shortcuts (requires a [Smithery](https://smithery.ai) account), i.e. `mcp connect notion` -> `mcp connect https://notion.run.tools`

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
mcp connect https://example.com/mcp --name example
```

You can also pass a bare service name instead of a full URL. The CLI resolves it to `https://<name>.run.tools` (Smithery):

```bash
mcp connect linear        # → https://linear.run.tools
mcp connect notion        # → https://notion.run.tools
```

Print the OAuth URL instead of opening a browser:

```bash
mcp connect https://example.com/mcp --name example --no-open
```

Use ngrok for OAuth callbacks (useful for OpenClaw/remote setups):

```bash
mcp connect https://example.com/mcp --name example --ngrok
```

Equivalent command:

```bash
mcp connections add https://example.com/mcp --name example [--no-open]
```

If `--name` is omitted, the CLI derives a name from the server hostname.

### List saved connections

```bash
mcp connections list
```

### Remove a saved connection

```bash
mcp connections remove example
```

## Working with a saved server

After a server is saved, address it by connection name:

```bash
mcp <connection> <category> <command>
```

Supported categories:

- `tools`
- `resources`
- `prompts`

### Tools

List available tools:

```bash
mcp example tools list
```

Paginate and show full descriptions:

```bash
mcp example tools list --offset 0 --limit 10 --full-description
```

Inspect a tool schema:

```bash
mcp example tools get search_docs
```

Call a tool interactively:

```bash
mcp example tools call search_docs
```

Call a tool with JSON arguments:

```bash
mcp example tools call search_docs --args '{"query":"oauth"}'
```

Return raw JSON output:

```bash
mcp example tools call search_docs --args '{"query":"oauth"}' --json
```

### Resources

List resources:

```bash
mcp example resources list
```

Read a resource:

```bash
mcp example resources get file:///docs/intro.md
```

### Prompts

List prompts:

```bash
mcp example prompts list
```

Render a prompt:

```bash
mcp example prompts get summarize_release
```

## OAuth flow

For servers that require OAuth:

1. The CLI opens the system browser (or prints the URL if `--no-open` was used).
2. It listens on a shared local callback server at `http://localhost:8912/<connection>/callback`.
3. If the connection was created with `--ngrok`, the redirect URI uses the ngrok URL for that same callback path instead of localhost.
4. After approval, tokens are stored for the saved connection and reused on future requests.
5. Both `--ngrok` and `--no-open` preferences are saved with the connection and applied automatically on future requests.

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
