import {convertToModelMessages, streamText, UIMessage} from 'ai'
import {createOllama} from 'ollama-ai-provider-v2'
import { getVectorStore } from '@/lib/vectorStore'


const ollama = createOllama();

const model = ollama("llama3.2")

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
`

export async function POST(req: Request) {
	const {messages}: {messages: UIMessage[]} = await req.json();

	// Get the latest user message for RAG context
	const latestMessage = messages[messages.length - 1];
	let context = '';

	if (latestMessage && latestMessage.parts) {
		const userText = latestMessage.parts
			.filter((part: any) => part.type === 'text')
			.map((part: any) => part.text)
			.join(' ');

		// Retrieve relevant documents from vector store
		try {
			const vectorStore = await getVectorStore();
			const relevantDocs = await vectorStore.similaritySearch(userText, 4);
			
			if (relevantDocs.length > 0) {
				context = '\n\nRelevant context from uploaded documents:\n' + 
					relevantDocs.map((doc, i) => `[${i + 1}] ${doc.pageContent}`).join('\n\n');
			}
		} catch (error) {
			console.error('Error retrieving context:', error);
		}
	}

	// Enhance the system prompt with retrieved context
	const enhancedPrompt = context 
		? `${prompt}${context}\n\nUse the above context to help answer the student's questions when relevant.`
		: prompt;

	const result = streamText({
		model: model,
        system: enhancedPrompt,
		messages: await convertToModelMessages(messages),
	});

	return result.toUIMessageStreamResponse();
}
