import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { fromJSONSchema } from "zod/v4";

type JsonSchema = Parameters<typeof fromJSONSchema>[0];

export async function getToolByName(client: Client, toolName: string): Promise<Tool | undefined> {
  const { tools } = await client.listTools();
  return tools.find((tool) => tool.name === toolName);
}

export function validateToolArguments(tool: Tool, toolArgs: unknown) {
  try {
    const schema = fromJSONSchema(tool.inputSchema as JsonSchema);
    return schema.safeParse(toolArgs);
  } catch (error) {
    throw new Error(
      `Unable to validate arguments for "${tool.name}" from its input schema: ${(error as Error).message}`,
    );
  }
}
