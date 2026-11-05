import { hasApiKey, MODELS } from "@/lib/engine/claude";
import { ENGINE_VERSION } from "@/lib/engine/pipeline";
import { blobConfigured } from "@/lib/server/blob";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    model: process.env.CLAUDE_MODEL ?? MODELS.haiku,
    hasKey: hasApiKey(),
    storage: blobConfigured(),
    engine: ENGINE_VERSION,
  });
}
