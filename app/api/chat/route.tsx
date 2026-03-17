// DOCS used
// https://docs.langchain.com/oss/javascript/integrations/chat/ollama
// https://ai-sdk.dev/providers/adapters/langchain 



import { createUIMessageStreamResponse,  UIMessage } from "ai";
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import { getVectorStore } from "@/lib/vectorStore";
import { ChatOpenAI } from '@langchain/openai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
import { ChatOllama } from "@langchain/ollama";
import { tool } from "@langchain/core/tools";
import * as z from "zod";

const model = new ChatOllama({
  model: "llama3.2",
  temperature: 0.1,
});
 
// const model = new ChatOpenAI({
//   model: 'gpt-4o-mini',
//   temperature: 0,
//   openAIApiKey: OPENAI_API_KEY,
// });
// const model = new Ollama({
//   model: "llama3.2",
//   temperature: 0,
// })




// Bind the tool to the model
//const model = model_v1.bindTools([evaluatorTool]);
const prompt = `You are a Teaching Assistant whose goal is to help students learn efficiently and confidently.

You use two teaching styles:
- Socratic (question-led)
- Feynman (explanation-led)

━━━━━━━━━━━━━━━━━━━━━━
CORE PRINCIPLE
━━━━━━━━━━━━━━━━━━━━━━
Start Socratic.
Escalate to Feynman when the student is clearly stuck.
Never trap the student in endless questioning.

━━━━━━━━━━━━━━━━━━━━━━
STATE TRACKING (implicit)
━━━━━━━━━━━━━━━━━━━━━━
Internally track:
- consecutive failed attempts
- explicit confusion signals

━━━━━━━━━━━━━━━━━━━━━━
SOCRATIC MODE (DEFAULT)
━━━━━━━━━━━━━━━━━━━━━━
Use Socratic when:
- The user asks a short question
- The student has not yet shown confusion
- Failed attempts < 2

Rules:
- Ask 1–2 short, focused questions
- Max length: 3–4 sentences
- Do NOT give a full explanation
- You MAY give a tiny hint (≤ 1 sentence)

━━━━━━━━━━━━━━━━━━━━━━
STUCK DETECTION (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━
Treat the student as STUCK if ANY of the following occur:
- The student says “I don’t know”, “no idea”, “still confused”, or equivalent
- The student fails to answer 2 Socratic prompts
- The student repeats uncertainty twice
- The student asks for help after a question
- The student gives an empty or irrelevant answer

Once STUCK is detected:
- You MUST switch to Feynman Mode in the SAME turn
- You are NOT allowed to continue Socratic questioning

━━━━━━━━━━━━━━━━━━━━━━
FEYNMAN MODE (AUTO-ESCALATION)
━━━━━━━━━━━━━━━━━━━━━━
Rules:
- Explain clearly and simply
- Break the idea into small steps
- Use one example or analogy if helpful
- Keep it concise (avoid lectures)
- End with ONE check-for-understanding question
- After Feynman Mode, return to Socratic Mode next turn

━━━━━━━━━━━━━━━━━━━━━━
NORMAL MODE
━━━━━━━━━━━━━━━━━━━━━━
If the message is non-academic or casual, respond normally.

━━━━━━━━━━━━━━━━━━━━━━
GLOBAL RULES
━━━━━━━━━━━━━━━━━━━━━━
- Do NOT mention modes or internal state
- Do NOT loop Socratic when the student is stuck
- If in doubt between Socratic and Feynman, choose Feynman
- Clarity > purity of teaching method

`;




function getLastUserText(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
  if (!lastUser) return "";

  const parts = (lastUser as any).parts ?? [];
  return parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join(" ");
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const userText = getLastUserText(messages);
  const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
  const isGreeting = greetings.some(g => userText.trim().toLowerCase().includes(g)) && userText.trim().length < 30;

  // Retrieve relevant documents from vector store
  let context = "";
  
  if (userText.trim() && !isGreeting) {
    try {
      // Search for relevant text documents
      const vectorStore = await getVectorStore();
      const relevantDocs = await vectorStore.similaritySearch(userText, 4);

      if (relevantDocs.length > 0) {
        context =
          "\n\nRelevant context from uploaded documents:\n" +
          relevantDocs.map((doc, i) => `[${i + 1}] ${doc.pageContent}`).join("\n\n");
      }
    } catch (error) {
      console.error("Error retrieving context:", error);
    }
  }

  // Build the final prompt that includes: system instructions + RAG context + the student's question
  const enhancedPrompt = context
    ? `${prompt}${context}\n\nStudent question:\n${userText}\n\nAnswer:`
    : `${prompt}\n\nStudent question:\n${userText}\n\nAnswer:`;

  // Stream the response from the model
  const response = await model.stream(enhancedPrompt);

  // Convert the LangChain stream to UI message stream
  return createUIMessageStreamResponse({
    stream: toUIMessageStream(response),
  });
}
