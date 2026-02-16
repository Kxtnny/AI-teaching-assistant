import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { ChatOllama } from "@langchain/ollama";

export const MindMapNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: z.string(),
    editable: z.boolean(),
    children: z.array(MindMapNodeSchema).optional(),
  })
);

export const MindmapBlankGen = tool(
  async ({ query }: { query: string }) => {
    const topic = query.trim();
    return { id: "root", label: topic, editable: false, children: [] };
  },
  {
    name: "mindmap_blank_gen",
    description:
      "Generate a blank mind map JSON skeleton with only a root node labeled as the topic and no children.",
    schema: z.object({ query: z.string().min(1) }),
  }
);

export const MindmapImprove = tool(
  async ({
    topic,
    mindmap,
    maxNewChildren = 3,
  }: {
    topic: string;
    mindmap: z.infer<typeof MindMapNodeSchema>;
    maxNewChildren?: number;
  }) => {
    // LangChain-native LLM for tool use
    const llm = new ChatOllama({
      model: "llama3.2",
      temperature: 0.2,
    });

    const system = `
You are a mind map improver. Return ONLY valid JSON.
Rules:
- Keep ids and structure of existing nodes unless adding new nodes.
- Do NOT overwrite any non-empty label.
- Fill empty labels for nodes where editable=true and label is empty/whitespace.
- You may add up to ${maxNewChildren} new child nodes total to improve coverage.
- Output must match this schema:
{ id: string, label: string, editable: boolean, children?: MindMapNode[] }
No markdown. No commentary.
`.trim();

    const user = `
TOPIC: ${topic}

CURRENT_MINDMAP_JSON:
${JSON.stringify(mindmap, null, 2)}
`.trim();

    const resp = await llm.invoke([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    let parsed: unknown;
    try {
      parsed = JSON.parse(String(resp.content));
    } catch {
      throw new Error("mindmap_improve: model did not return valid JSON");
    }

    return MindMapNodeSchema.parse(parsed);
  },
  {
    name: "mindmap_improve",
    description:
      "Fill blanks and improve an existing mind map JSON while preserving user-provided labels. Returns updated mind map JSON.",
    schema: z.object({
      topic: z.string().min(1),
      mindmap: MindMapNodeSchema,
      maxNewChildren: z.number().int().min(0).max(10).optional(),
    }),
  }
);