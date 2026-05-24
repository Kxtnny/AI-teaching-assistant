import { HumanMessage } from "@langchain/core/messages";
import { ChatOllama } from "@langchain/ollama";

const DEFAULT_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "llama3.2-vision";

function mimeTypeFromExtension(extension?: string) {
  const ext = String(extension || "png").toLowerCase().replace(/^\./, "");
  if (ext === "jpg") return "image/jpeg";
  if (ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "png") return "image/png";
  return `image/${ext || "png"}`;
}

export async function describePdfImageBlockWithVision(params: {
  imageBase64: string;
  imageExtension?: string;
  surroundingText?: string;
  pageLabel: string;
  modelName?: string;
}) {
  const llm = new ChatOllama({
    model: params.modelName || DEFAULT_VISION_MODEL,
    temperature: 0,
  });

  const response = await llm.invoke([
    new HumanMessage({
      content: [
        {
          type: "text",
          text: [
            "You are extracting a single isolated image block from a PDF for an educational RAG system.",
            "Describe only what is visible in this isolated image.",
            "Preserve labels, captions, formulas, axis titles, legends, and table cells when present.",
            "If the image is a diagram or chart, explain the structure and relationships, not just the topic.",
            "Do not invent details that are not visible.",
            "Return concise study-ready prose plus any extracted text or bullet points.",
            `Page: ${params.pageLabel}`,
            `Adjacent text: ${String(params.surroundingText || "[No adjacent text]").trim()}`,
          ].join("\n"),
        },
        {
          type: "image_url",
          image_url: `data:${mimeTypeFromExtension(params.imageExtension)};base64,${params.imageBase64}`,
        },
      ],
    }),
  ]);

  return String(response.content || "").trim();
}
