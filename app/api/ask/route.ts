import { answerQuestion } from "@/lib/engine/pipeline";
import { allow, clientKey } from "@/lib/server/rateLimit";
import type { AskRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!allow(`ask:${clientKey(req)}`, 40, 60_000)) {
    return Response.json({ error: "Too many questions in a minute. Please wait a moment." }, { status: 429 });
  }
  let body: AskRequestBody;
  try {
    body = (await req.json()) as AskRequestBody;
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body?.question || typeof body.question !== "string" || !body.knowledge || !body.now?.date) {
    return Response.json({ error: "Missing question, knowledge or time" }, { status: 400 });
  }
  if (JSON.stringify(body.knowledge).length > 200_000) return Response.json({ error: "Too large" }, { status: 413 });
  const model = body.model === "sonnet" || body.model === "rules" ? body.model : undefined;
  const result = await answerQuestion({ ...body, question: body.question.slice(0, 600), model });
  return Response.json(result);
}
