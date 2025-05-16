// src/ai/flows/global-ai-chatbot-flow.ts
'use server';
/**
 * @fileOverview A general knowledge AI chatbot.
 *
 * - askGlobalChatbot - A function that handles user questions.
 * - GlobalChatbotInput - The input type for the askGlobalChatbot function.
 * - GlobalChatbotOutput - The return type for the askGlobalChatbot function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GlobalChatbotInputSchema = z.object({
  question: z.string().describe('The user\'s question.'),
});
export type GlobalChatbotInput = z.infer<typeof GlobalChatbotInputSchema>;

const GlobalChatbotOutputSchema = z.object({
  answer: z.string().describe('The AI\'s answer to the question.'),
});
export type GlobalChatbotOutput = z.infer<typeof GlobalChatbotOutputSchema>;

export async function askGlobalChatbot(input: GlobalChatbotInput): Promise<GlobalChatbotOutput> {
  return globalChatbotFlow(input);
}

const globalChatbotPrompt = ai.definePrompt({
  name: 'globalChatbotPrompt',
  input: {schema: GlobalChatbotInputSchema},
  output: {schema: GlobalChatbotOutputSchema},
  prompt: `You are SkillForge AI, a helpful and knowledgeable AI assistant for the SkillForge platform.
Answer the user's question clearly and concisely. You can answer general knowledge questions.

User Question: {{{question}}}
`,
  // Optional: Add safety settings if needed
  // config: {
  //   safetySettings: [
  //     {
  //       category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  //       threshold: 'BLOCK_ONLY_HIGH',
  //     },
  //   ],
  // },
});

const globalChatbotFlow = ai.defineFlow(
  {
    name: 'globalChatbotFlow',
    inputSchema: GlobalChatbotInputSchema,
    outputSchema: GlobalChatbotOutputSchema,
  },
  async (input) => {
    const {output} = await globalChatbotPrompt(input);
    if (!output) {
        // Fallback or error handling if output is null/undefined
        return { answer: "I'm sorry, I couldn't generate a response at this moment. Please try again." };
    }
    return output;
  }
);
