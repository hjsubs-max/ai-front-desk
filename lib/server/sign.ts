import { createHmac } from "node:crypto";

function secret(): string {
  return process.env.EVAL_SECRET ?? process.env.ANTHROPIC_API_KEY ?? "local-dev-secret";
}

export function sign(payload: unknown): string {
  return createHmac("sha256", secret()).update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}
