#!/usr/bin/env bun
import { Command } from "commander";
import { input } from "@inquirer/prompts";
import { addConnection, getConnection, getConnections, removeConnection } from "./config.ts";
import { connectAndSave, createClient } from "./client.ts";

const program = new Command();

program
  .name("mcp-to-cli")
  .description(
    `Connect to remote MCP servers and interact with their tools, resources, and prompts.

Once a connection is saved, interact with it using:

  $ mcp-to-cli <connection> tools list              List available tools
  $ mcp-to-cli <connection> tools get <tool>        Show a tool's input schema
  $ mcp-to-cli <connection> tools call <tool>       Call a tool (interactive or --args '{...}')
  $ mcp-to-cli <connection> resources list           List available resources
  $ mcp-to-cli <connection> resources get <uri>      Read a resource by URI
  $ mcp-to-cli <connection> prompts list             List available prompts
  $ mcp-to-cli <connection> prompts get <prompt>     Render a prompt (interactive args)`
  )
  .version("0.1.0");

// --- shared connect handler ---
async function connectAction(url: string, opts: { name?: string }) {
  const name = opts.name || new URL(url).hostname.split(".")[0];
  console.log(`Connecting to ${url} as "${name}"...`);

  try {
    const client = await connectAndSave(url, name);
    await addConnection({ name, url, addedAt: new Date().toISOString() });

    const capabilities = client.getServerCapabilities();
    const serverInfo = client.getServerVersion();
    console.log(`\nConnected to ${serverInfo?.name || "server"} (${serverInfo?.version || "unknown"})`);
    if (capabilities?.tools) console.log("  Tools: available");
    if (capabilities?.resources) console.log("  Resources: available");
    if (capabilities?.prompts) console.log("  Prompts: available");
    console.log(`\nConnection saved as "${name}"`);
    console.log(`\nTry: mcp-to-cli ${name} tools list`);

    await client.close();
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
}

// --- connect command (top-level alias) ---
program
  .command("connect <url>")
  .description("Connect to an MCP server and save the connection (alias for connections add)")
  .option("-n, --name <name>", "Friendly name for this connection")
  .action(connectAction);

// --- connections command ---
const connections = program.command("connections").description("Manage saved connections");

connections
  .command("add <url>")
  .description("Connect to an MCP server and save the connection")
  .option("-n, --name <name>", "Friendly name for this connection")
  .action(connectAction);

connections
  .command("list")
  .alias("ls")
  .description("List all saved connections")
  .action(async () => {
    const conns = await getConnections();
    if (conns.length === 0) {
      console.log("No connections saved. Use: mcp-to-cli connect <url> --name <name>");
      return;
    }
    console.log("Saved connections:\n");
    for (const c of conns) {
      console.log(`  ${c.name}`);
      console.log(`    URL: ${c.url}`);
      console.log(`    Added: ${c.addedAt}`);
      console.log(`    Try:  mcp-to-cli ${c.name} tools list\n`);
    }
    console.log("Usage: mcp-to-cli <connection> <tools|resources|prompts> <command>");
  });

connections
  .command("remove <name>")
  .alias("rm")
  .description("Remove a saved connection")
  .action(async (name: string) => {
    const removed = await removeConnection(name);
    if (removed) {
      console.log(`Connection "${name}" removed.`);
    } else {
      console.error(`Connection "${name}" not found.`);
      process.exit(1);
    }
  });

// --- Dynamic server subcommand ---
// We parse argv to detect `mcp-to-cli <name> tools list` pattern
// Commander doesn't natively support dynamic first-arg subcommands,
// so we intercept before parsing.

async function handleServerCommand(serverName: string, args: string[]) {
  const conn = await getConnection(serverName);
  if (!conn) {
    console.error(`Unknown connection "${serverName}". Run: mcp-to-cli connections list`);
    process.exit(1);
  }

  const category = args[0]; // tools, resources, prompts
  const action = args[1]; // list, get, call
  const extra = args.slice(2); // tool name, etc.

  if (!category) {
    console.log(`${serverName} (${conn.url})\n`);
    console.log(`Usage: mcp-to-cli ${serverName} <command>\n`);
    console.log("Commands:\n");
    console.log(`  tools list                List available tools`);
    console.log(`  tools get <tool>          Show a tool's input schema`);
    console.log(`  tools call <tool>         Call a tool (interactive or --args '{...}')`);
    console.log(`  resources list            List available resources`);
    console.log(`  resources get <uri>       Read a resource by URI`);
    console.log(`  prompts list              List available prompts`);
    console.log(`  prompts get <prompt>      Render a prompt (interactive args)`);
    return;
  }

  const client = await createClient(serverName);

  try {
    switch (category) {
      case "tools":
        await handleTools(client, serverName, action, extra);
        break;
      case "resources":
        await handleResources(client, serverName, action, extra);
        break;
      case "prompts":
        await handlePrompts(client, serverName, action, extra);
        break;
      default:
        console.error(`Unknown category "${category}". Use: tools, resources, or prompts`);
        process.exit(1);
    }
  } finally {
    await client.close();
  }
}

async function handleTools(client: any, serverName: string, action: string | undefined, extra: string[]) {
  switch (action) {
    case "list":
    case "ls": {
      const fullDescription = extra.includes("--full-description");
      const limitIdx = extra.indexOf("--limit");
      const offsetIdx = extra.indexOf("--offset");
      const pageSize = limitIdx >= 0 && extra[limitIdx + 1] ? parseInt(extra[limitIdx + 1], 10) : 5;
      const offset = offsetIdx >= 0 && extra[offsetIdx + 1] ? parseInt(extra[offsetIdx + 1], 10) : 0;

      const { tools } = await client.listTools();
      if (tools.length === 0) {
        console.log("No tools available.");
        return;
      }

      const sorted = [...tools].sort((a: any, b: any) => a.name.localeCompare(b.name));
      const page = sorted.slice(offset, offset + pageSize);
      const MAX_DESC = 200;
      let anyTruncated = false;

      for (const tool of page) {
        console.log(`  ${tool.name}`);
        if (tool.description) {
          if (fullDescription || tool.description.length <= MAX_DESC) {
            console.log(`    ${tool.description}`);
          } else {
            anyTruncated = true;
            console.log(`    ${tool.description.slice(0, MAX_DESC)}... (${tool.description.length} chars)`);
          }
        }
        console.log();
      }

      const showing = Math.min(page.length, pageSize);
      console.log(`Showing ${offset + 1}-${offset + showing} of ${tools.length} tools (sorted alphabetically)`);

      if (offset + pageSize < tools.length) {
        console.log(`Next page: mcp-to-cli ${serverName} tools list --offset ${offset + pageSize}${limitIdx >= 0 ? ` --limit ${pageSize}` : ""}`);
      }
      if (anyTruncated) {
        console.log(`Descriptions truncated to ${MAX_DESC} chars. Use --full-description to see full text.`);
      }
      break;
    }
    case "get": {
      const toolName = extra[0];
      if (!toolName) {
        console.error("Usage: mcp-to-cli <name> tools get <tool_name>");
        process.exit(1);
      }
      const { tools } = await client.listTools();
      const tool = tools.find((t: any) => t.name === toolName);
      if (!tool) {
        console.error(`Tool "${toolName}" not found.`);
        process.exit(1);
      }
      console.log(`Tool: ${tool.name}`);
      if (tool.description) console.log(`Description: ${tool.description}`);
      console.log(`\nInput Schema:`);
      console.log(JSON.stringify(tool.inputSchema, null, 2));
      break;
    }
    case "call": {
      const toolName = extra[0];
      if (!toolName) {
        console.error("Usage: mcp-to-cli <name> tools call <tool_name> [--args '{...}']");
        process.exit(1);
      }

      // Check for --args flag
      const argsIdx = extra.indexOf("--args");
      let toolArgs: Record<string, any> = {};

      if (argsIdx >= 0 && extra[argsIdx + 1]) {
        try {
          toolArgs = JSON.parse(extra[argsIdx + 1]);
        } catch {
          console.error("Invalid JSON for --args");
          process.exit(1);
        }
      } else {
        // Interactive mode: fetch schema and prompt for each field
        const { tools } = await client.listTools();
        const tool = tools.find((t: any) => t.name === toolName);
        if (!tool) {
          console.error(`Tool "${toolName}" not found.`);
          process.exit(1);
        }

        const schema = tool.inputSchema;
        if (schema?.properties) {
          console.log(`\nFill in arguments for "${toolName}":\n`);
          for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
            const required = schema.required?.includes(key);
            const desc = prop.description ? ` (${prop.description})` : "";
            const type = prop.type || "string";
            const label = `${key}${desc}${required ? " *" : ""}`;

            const value = await input({
              message: label,
              default: prop.default?.toString(),
            });

            if (value !== "") {
              // Type coerce based on schema
              if (type === "number" || type === "integer") {
                toolArgs[key] = Number(value);
              } else if (type === "boolean") {
                toolArgs[key] = value === "true" || value === "1";
              } else if (type === "object" || type === "array") {
                try {
                  toolArgs[key] = JSON.parse(value);
                } catch {
                  toolArgs[key] = value;
                }
              } else {
                toolArgs[key] = value;
              }
            }
          }
        }
      }

      console.log(`\nCalling ${toolName}...`);
      const result = await client.callTool({ name: toolName, arguments: toolArgs });

      if (result.isError) {
        console.error("\nTool returned an error:");
      } else {
        console.log("\nResult:");
      }

      for (const content of result.content as any[]) {
        if (content.type === "text") {
          console.log(content.text);
        } else if (content.type === "image") {
          console.log(`[Image: ${content.mimeType}]`);
        } else if (content.type === "resource") {
          console.log(`[Resource: ${content.resource?.uri}]`);
          if (content.resource?.text) console.log(content.resource.text);
        } else {
          console.log(JSON.stringify(content, null, 2));
        }
      }
      break;
    }
    default:
      console.log(`Usage: mcp-to-cli ${serverName} tools <list|get|call> [tool_name]`);
  }
}

async function handleResources(client: any, serverName: string, action: string | undefined, extra: string[]) {
  switch (action) {
    case "list":
    case "ls": {
      const { resources } = await client.listResources();
      if (resources.length === 0) {
        console.log("No resources available.");
        return;
      }
      console.log(`Resources (${resources.length}):\n`);
      for (const r of resources) {
        console.log(`  ${r.name} (${r.uri})`);
        if (r.description) console.log(`    ${r.description}`);
        if (r.mimeType) console.log(`    Type: ${r.mimeType}`);
      }
      break;
    }
    case "get":
    case "read": {
      const uri = extra[0];
      if (!uri) {
        console.error("Usage: mcp-to-cli <name> resources get <uri>");
        process.exit(1);
      }
      const { contents } = await client.readResource({ uri });
      for (const content of contents) {
        if (content.text) {
          console.log(content.text);
        } else if (content.blob) {
          console.log(`[Binary data: ${content.mimeType || "unknown type"}]`);
        }
      }
      break;
    }
    default:
      console.log(`Usage: mcp-to-cli ${serverName} resources <list|get> [uri]`);
  }
}

async function handlePrompts(client: any, serverName: string, action: string | undefined, extra: string[]) {
  switch (action) {
    case "list":
    case "ls": {
      const { prompts } = await client.listPrompts();
      if (prompts.length === 0) {
        console.log("No prompts available.");
        return;
      }
      console.log(`Prompts (${prompts.length}):\n`);
      for (const p of prompts) {
        console.log(`  ${p.name}`);
        if (p.description) console.log(`    ${p.description}`);
        if (p.arguments?.length) {
          for (const arg of p.arguments) {
            console.log(`    - ${arg.name}${arg.required ? " *" : ""}: ${arg.description || ""}`);
          }
        }
      }
      break;
    }
    case "get": {
      const promptName = extra[0];
      if (!promptName) {
        console.error("Usage: mcp-to-cli <name> prompts get <prompt_name>");
        process.exit(1);
      }

      // Get prompt info for arguments
      const { prompts } = await client.listPrompts();
      const promptDef = prompts.find((p: any) => p.name === promptName);
      if (!promptDef) {
        console.error(`Prompt "${promptName}" not found.`);
        process.exit(1);
      }

      const promptArgs: Record<string, string> = {};
      if (promptDef.arguments?.length) {
        console.log(`\nFill in arguments for prompt "${promptName}":\n`);
        for (const arg of promptDef.arguments) {
          const label = `${arg.name}${arg.description ? ` (${arg.description})` : ""}${arg.required ? " *" : ""}`;
          const value = await input({ message: label });
          if (value !== "") promptArgs[arg.name] = value;
        }
      }

      const { messages } = await client.getPrompt({ name: promptName, arguments: promptArgs });
      console.log("\nPrompt messages:\n");
      for (const msg of messages) {
        console.log(`[${msg.role}]`);
        if (typeof msg.content === "string") {
          console.log(msg.content);
        } else if (msg.content?.type === "text") {
          console.log(msg.content.text);
        } else {
          console.log(JSON.stringify(msg.content, null, 2));
        }
        console.log();
      }
      break;
    }
    default:
      console.log(`Usage: mcp-to-cli ${serverName} prompts <list|get> [prompt_name]`);
  }
}

// Main entry point
async function main() {
  const argv = process.argv.slice(2);

  // Check if the first arg is a known subcommand
  const knownCommands = ["connect", "connections", "help", "--help", "-h", "--version", "-V"];
  const firstArg = argv[0];

  if (firstArg && !knownCommands.includes(firstArg) && !firstArg.startsWith("-")) {
    // Could be a server name like `mcp-to-cli notion tools list`
    // Check if it's a stored connection
    const conn = await getConnection(firstArg);
    if (conn) {
      await handleServerCommand(firstArg, argv.slice(1));
      return;
    }
    // Not a known connection — might be a URL passed directly (old-style)
    // Fall through to commander
  }

  await program.parseAsync(["node", "mcp-to-cli", ...argv]);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
