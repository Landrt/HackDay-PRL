import type { Tool } from "../../types.js";
import { agendaLireTool, agendaAjouterTool } from "./agenda.js";
import { envoyerMessageTool } from "./message.js";

export const defaultTools: Tool[] = [
  agendaLireTool,
  agendaAjouterTool,
  envoyerMessageTool
];

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor(tools: Tool[] = defaultTools) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }
}

export const toolRegistry = new ToolRegistry();
