# Dogfood Report: `mcp-to-cli` with Notion

**Date**: 2026-03-13
**Tester**: Codex
**Command under test**: `npx .`
**Connection used**: `notion` -> `https://mcp.notion.com/mcp`

## Overall Take

This is noticeably better than the last pass. The CLI now explains `tools call`, translates unsupported prompt operations into a normal human message, and compresses schema-validation failures into something readable. Those changes remove a lot of the "protocol leaking through the UX" feeling.

At this point the biggest remaining issue is output shaping. The CLI is capable, but for high-volume tools like Notion search and fetch it still prints large transport-shaped payloads that are hard to scan in a terminal.

## What I Ran

```bash
npx . --help
npx . connections list
npx . notion tools call --help
npx . notion prompts list
npx . notion tools call notion-get-teams --args '{}'
npx . notion tools call notion-get-teams --args '{}' --json
npx . notion tools call notion-search --args '{"query":"","query_type":"internal"}'
npx . notion tools call notion-search --args '{"query":"ani","query_type":"user"}'
npx . notion tools call notion-search --args '{"query":"Smithery","query_type":"internal"}'
npx . notion tools call notion-fetch --args '{"id":"320a0cc7-6127-8022-950b-d7e8d3b20862"}'
```

## What Improved

### 1. Nested help now works

**Status**: Fixed

This command now returns real guidance instead of treating `--help` as a tool name:

```bash
npx . notion tools call --help
```

Current output:

```text
Usage: mcp-to-cli <name> tools call <tool_name> [--args '{...}']

Modes:
  Interactive:  mcp-to-cli <name> tools call <tool>          (prompts for each argument)
  Scripted:     mcp-to-cli <name> tools call <tool> --args '{"key":"value"}'
  Raw JSON:     Add --json to get unformatted JSON output
```

This is the single highest-value improvement from the previous pass. It makes the command legible.

### 2. Unsupported prompt support is translated cleanly

**Status**: Fixed

This command:

```bash
npx . notion prompts list
```

now returns:

```text
This server does not support that feature.
```

That is much better than exposing raw MCP method errors.

### 3. Validation errors are now user-readable

**Status**: Fixed

This command:

```bash
npx . notion tools call notion-search --args '{"query":"","query_type":"internal"}'
```

now returns:

```text
Invalid arguments: `query`: String must contain at least 1 character(s)
```

That is still accurate, but now it reads like a CLI message rather than a schema dump.

## Remaining Findings

### 1. Large search results are still too raw for terminal use

**Severity**: Medium

This command works:

```bash
npx . notion tools call notion-search --args '{"query":"Smithery","query_type":"internal"}'
```

but the output is still a very large JSON object with long highlight strings and many results in one block. It is technically correct, but it is not pleasant to scan interactively.

What I want here is a human-first default such as:

- numbered results
- title, type, timestamp, short snippet
- a default result cap
- `--json` or `--raw` for the full payload

Right now the CLI gives me the transport, not a terminal view.

### 2. `fetch` still returns a giant JSON wrapper around a giant string payload

**Severity**: Medium

This command succeeds:

```bash
npx . notion tools call notion-fetch --args '{"id":"320a0cc7-6127-8022-950b-d7e8d3b20862"}'
```

but the response shape is still awkward for humans:

- outer JSON object
- `text` field
- inside that field, a large Notion-flavored markdown/XML document

That may be the right raw representation, but the CLI should probably offer a friendlier rendered mode by default and reserve the current shape for `--json`.

### 3. `--json` exists now, but the default output mode still needs stronger opinions

**Severity**: Low

It is good that this now works:

```bash
npx . notion tools call notion-get-teams --args '{}' --json
```

That said, the presence of `--json` makes the current default output feel even more unfinished. If there is an explicit raw mode, the default mode should be more curated than it is today.

### 4. The happy path is solid

**Severity**: Low, positive

The Notion connection is genuinely useful from the CLI:

- `connections list` is clear
- `tools call --help` now teaches the command shape
- read-only calls like `notion-get-teams` work immediately
- user search works
- workspace search works
- page fetch works

So my view now is that the product is crossing from "sharp prototype" into "usable tool." The remaining work is mostly around terminal ergonomics, not core functionality.

## Suggestions

1. Keep `--json` as the escape hatch and make the default output mode more human-oriented.
2. Add result limiting and summary views for search-heavy tools.
3. Add a rendered mode for common MCP result types like page fetches.
4. Consider a consistent output contract:
   human view by default, raw transport with `--json`.

## Bottom Line

I would use this now. The command surface makes a lot more sense than it did before, and the Notion workflow is real.

The next improvement I would prioritize is not more capability. It is better terminal presentation for large MCP responses, because that is now the main thing making the product feel heavier than it should.
