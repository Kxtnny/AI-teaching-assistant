import { NextRequest, NextResponse } from 'next/server';
import { ollama } from 'ollama-ai-provider-v2';
import { generateText } from 'ai';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'No messages provided' },
        { status: 400 }
      );
    }

    // Format the conversation for analysis
    const conversationText = messages
      .map((msg: any) => {
        const role = msg.role === 'user' ? 'Student' : 'AI Teacher';
        const text = msg.parts
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text)
          .join(' ');
        return `${role}: ${text}`;
      })
      .join('\n\n');

    // Create a prompt for Ollama to analyze the conversation
    const prompt = `Analyze the following conversation between a student and an AI teaching assistant. Evaluate the STUDENT's performance and learning progress based on their questions and responses.

Conversation:
${conversationText}

Evaluate the STUDENT based on:
1. Understanding (0-100): How well does the student grasp the concepts being discussed? Are they making progress?
2. Engagement (0-100): How actively engaged is the student in the learning process? Are they asking questions and participating?
3. Critical Thinking (0-100): Does the student show analytical thinking, asking deeper questions, or making connections?
4. Communication (0-100): How clearly does the student articulate their questions and thoughts?
5. Progress (0-100): How much learning progress has the student made during this conversation?

Also provide:
- A brief summary (2-3 sentences) of the student's learning journey in this conversation
- Key topics the student explored (array of strings)
- Suggestions for the student to improve their learning (array of strings)

Return ONLY a valid JSON object with this structure:
{
  "understanding": number,
  "engagement": number,
  "criticalThinking": number,
  "communication": number,
  "progress": number,
  "summary": string,
  "topics": string[],
  "suggestions": string[]
}`;

    // Generate the analysis using Ollama
    const { text } = await generateText({
      model: ollama('llama3.2'),
      prompt: prompt,
      temperature: 0.3,
    });

    // Parse the JSON response
    let evaluation;
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Ollama response:', text);
      // Return default values if parsing fails
      evaluation = {
        understanding: 50,
        engagement: 50,
        criticalThinking: 50,
        communication: 50,
        progress: 50,
        summary: 'Analysis in progress. Continue the conversation for better evaluation.',
        topics: ['General conversation'],
        suggestions: ['Continue engaging with the learning material for a more detailed assessment'],
      };
    }

    return NextResponse.json({
      success: true,
      evaluation,
      messageCount: messages.length,
    });
  } catch (error) {
    console.error('Summary API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
