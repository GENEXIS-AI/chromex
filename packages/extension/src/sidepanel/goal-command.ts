export interface ParsedGoalCommand {
  objective: string;
}

export function parseGoalCommand(message: string): ParsedGoalCommand | null {
  const trimmed = message.trim();
  const match = /^\/goal(?:\s+([\s\S]+))?$/u.exec(trimmed);
  const objective = match?.[1]?.trim() ?? "";
  return objective ? { objective } : null;
}
