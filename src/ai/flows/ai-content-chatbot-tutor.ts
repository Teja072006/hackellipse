// This is an AI-powered chatbot tutor that can answer questions about the content of a file.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ChatbotInputSchema = z.object({
  fileContent: z.string().describe('The content of the file (video transcript, audio transcript, or text).'),
  question: z.string().describe('The question the user is asking about the file content.'),
});
export type ChatbotInput = z.infer<typeof ChatbotInputSchema>;

const ChatbotOutputSchema = z.object({
  answer: z.string().describe('The answer to the user\'s question, based on the file content.'),
});
export type ChatbotOutput = z.infer<typeof ChatbotOutputSchema>;

export async function askChatbot(input: ChatbotInput): Promise<ChatbotOutput> {
  return chatbotFlow(input);
}

const chatbotPrompt = ai.definePrompt({
  name: 'chatbotPrompt',
  input: {schema: ChatbotInputSchema},
  output: {schema: ChatbotOutputSchema},
  prompt: `You are a tutor bot whose purpose is to answer question about the content provided. Please answer the question based on the following file content. If you cannot answer the question based on the content, please respond that you cannot answer the question.

Content: {{{fileContent}}}

Question: {{{question}}}`,
});

const chatbotFlow = ai.defineFlow(
  {
    name: 'chatbotFlow',
    inputSchema: ChatbotInputSchema,
    outputSchema: ChatbotOutputSchema,
  },
  async input => {
    const {output} = await chatbotPrompt(input);
    return output!;
  }
);
