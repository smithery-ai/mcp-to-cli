# Dogfood Report: `mcp-to-cli` with Notion

**Date**: 2026-03-13
**Tester**: Codex
**Command under test**: `npx .`
**Connection used**: `notion` -> `https://mcp.notion.com/mcp`

## Overall Take

The core idea is good. Once the `notion` connection is already present, the CLI can discover tools, inspect schemas, search users, search workspace content, fetch pages, and read MCP resources with very little ceremony.

The weak point is the product surface around that capability. The first-run path is brittle, error handling is too raw, and several command shapes are surprising enough that I had to guess and probe instead of being guided by the CLI. As a power-user utility this is close; as a generally pleasant CLI it still feels sharp-edged.

## What I Ran

```bash
npx .
npx . --help
npx . connections list
npx . notion tools list
npx . notion tools list --offset 5
npx . notion tools list --offset 10
npx . notion tools get notion-fetch
npx . notion tools get notion-search
npx . notion resources list
npx . notion resources get notion://docs/enhanced-markdown-spec
npx . notion resources get notion://docs/view-dsl-spec
npx . notion prompts list
npx . notion tools call notion-get-teams --args '{}'
npx . notion tools call notion-get-users --args '{}'
npx . notion tools call notion-search --args '{"query":"ani","query_type":"user"}'
npx . notion tools call notion-search --args '{"query":"Smithery","query_type":"internal"}'
npx . notion tools call notion-fetch --args '{"id":"320a0cc7-6127-8022-950b-d7e8d3b20862"}'
```

## Findings

### 1. First run fails before the product even starts

**Severity**: High

Running `npx .` in a fresh checkout failed with:

```text
error: Cannot find package 'commander' from '/Users/anirudh/conductor/workspaces/mcp-to-cli/la-paz-v2/src/cli.ts'
```

I had to run `bun install` manually before the CLI became usable. For a local-dev workflow that is acceptable, but for a dogfood command this is a hard stop. If `npx .` is the intended entrypoint, it should either work out of the box or fail with an explicit setup instruction.

**What I expected**: either a working command or a direct message like "Dependencies missing. Run `bun install`."

### 2. `prompts list` leaks a raw MCP protocol error

**Severity**: Medium

This command:

```bash
npx . notion prompts list
```

returned:

```text
MCP error -32601: Method not found
```

That is technically true, but it is not a product-grade response. The CLI knows the user is trying to list prompts; it should translate unsupported MCP methods into something like:

```text
This server does not implement prompts.
```

or

```text
Prompts are not supported by this connection.
```

Right now the user has to understand JSON-RPC error codes to know whether they made a mistake or the server simply does not support that feature.

### 3. Subcommand help is broken or at least very misleading

**Severity**: Medium

This command:

```bash
npx . notion tools call --help
```

returned:

```text
Tool "--help" not found.
```

That makes the interface feel unstable. A normal CLI expectation is that `--help` works at every level. Here it gets consumed as a positional tool name, which means the user cannot discover how `tools call` is supposed to work from the place they most need help.

### 4. `tools call` defaults to an interactive prompt, but the interaction model is opaque

**Severity**: Medium

Running:

```bash
npx . notion tools call notion-get-teams
```

dropped into an interactive prompt for optional arguments. That is fine in principle, but the CLI gives no up-front clue that this will happen, and there is no easy `--help` path for that command.

This becomes a usability issue because the product is trying to serve both:

- humans using the CLI interactively
- users who want to script tool calls with `--args`

The CLI supports both modes, but it does not explain the contract clearly enough.

### 5. Validation errors are accurate but not user-oriented

**Severity**: Medium

This command:

```bash
npx . notion tools call notion-search --args '{"query":""}'
```

returned a full schema-validation payload:

```text
Invalid arguments for tool notion-search: [
  {
    "code": "too_small",
    "minimum": 1,
    "type": "string",
    "inclusive": true,
    "exact": false,
    "message": "String must contain at least 1 character(s)",
    "path": [
      "query"
    ]
  }
]
```

The detail is useful, but the UX is too low-level by default. A cleaner top line would help:

```text
`query` must be a non-empty string.
```

Then optionally show the structured validation block behind `--verbose`.

### 6. Large result sets are dumped raw with no shaping

**Severity**: Medium

This command:

```bash
npx . notion tools call notion-search --args '{"query":"Smithery","query_type":"internal"}'
```

returned a very large JSON blob with dozens of results, long highlight excerpts, and enough output that the terminal view became hard to scan. It works, but it does not feel designed.

The current behavior is fine for piping, but interactive terminal usage needs a presentation layer:

- cap results by default
- show a concise table/list view first
- add `--json` for raw output
- maybe add `--limit`

Right now the command technically succeeds while still making the human do too much parsing.

### 7. Output formats are inconsistent across adjacent flows

**Severity**: Low

Different commands return noticeably different shapes:

- `tools list` is a curated human-readable list
- `tools get` is a readable schema dump
- `tools call` returns raw JSON blobs
- `resources get` returns raw text payloads
- `fetch` returns JSON whose main content is a giant string containing Notion-flavored markdown/XML

That inconsistency is understandable because MCP payloads vary, but the CLI needs a stronger opinion about formatting. Today it feels like each path exposes a different abstraction layer.

### 8. The happy path is real once you already know the shape

**Severity**: Low, positive

After I got past the rough edges, the CLI did useful work quickly:

- `connections list` clearly showed the saved `notion` connection
- `tools list` paginated successfully with `--offset`
- `tools get notion-fetch` and `tools get notion-search` were useful for schema discovery
- `notion-get-teams` and `notion-get-users` worked cleanly with `--args '{}'`
- user search worked well with `{"query":"ani","query_type":"user"}`
- internal search found real workspace pages
- `notion-fetch` successfully fetched a page by UUID
- resources could be read directly by URI

So the underlying foundation is solid enough that I would keep using it. The main problem is polish and guidance, not fundamental capability.

## Product Suggestions

1. Add first-run dependency guidance if local packages are missing.
2. Normalize unsupported-feature errors like `Method not found` into product language.
3. Make `--help` work consistently at every nesting level.
4. Document and surface the dual mode for `tools call`: interactive prompt vs `--args`.
5. Add a compact default renderer for large tool outputs, with `--json` as the escape hatch.
6. Add small affordances for interactive usage: `--limit`, `--verbose`, maybe `--raw`.
7. Consider a more opinionated fetch/search UX for common MCP patterns instead of always returning transport-shaped output.

## Bottom Line

I like the direction. It already proves that "remote MCP from a CLI" is useful, and the Notion integration is capable enough to inspect a real workspace immediately.

What holds it back is not missing power. It is that the CLI still speaks too much in backend/protocol terms and not enough in user-facing terms. Tightening first-run behavior, help, error translation, and output shaping would move it from "works if you are determined" to "pleasant tool I would actually recommend."
