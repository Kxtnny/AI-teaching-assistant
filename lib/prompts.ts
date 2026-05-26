export function buildCaptionPrompt(extractedContent: string) {
  return `You are a precise document describer. The input contains extracted text from pages or image frames of a document. For each logical page or frame, produce 1-3 short, complete declarative sentences that describe what is visible (headings, main idea, figures, formulas, and important labels). Also produce a short overall 2-4 sentence summary for the entire input.

Return strict JSON with this shape:
{ "pages": [{ "page": 1, "summary": "..." }, ...], "overall": "..." }

Be concise and factual. Do not include extraneous commentary.

ExtractedContent:
${extractedContent}`;
}
