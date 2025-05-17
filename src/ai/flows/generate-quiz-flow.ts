// src/ai/flows/generate-quiz-flow.ts
'use server';
/**
 * @fileOverview AI flow for generating a multiple-choice quiz from given content.
 *
 * - generateQuiz - A function that handles the quiz generation process.
 * - GenerateQuizInput - The input type for the generateQuiz function (imported).
 * - GenerateQuizOutput - The return type for the generateQuiz function (imported).
 * - QuizQuestion - The structure for a single quiz question (imported).
 */

import {ai} from '@/ai/genkit';
import {
  GenerateQuizInputSchema,
  GenerateQuizOutputSchema,
  type GenerateQuizInput,
  type GenerateQuizOutput,
  type QuizQuestion
} from '@/ai/schemas/quiz-schemas'; // Import from the new schemas file

// Re-export types for convenience if they are used by client components
export type { GenerateQuizInput, GenerateQuizOutput, QuizQuestion };

export async function generateQuiz(input: GenerateQuizInput): Promise<GenerateQuizOutput> {
  return generateQuizFlow(input);
}

const generateQuizPrompt = ai.definePrompt({
  name: 'generateQuizPrompt',
  input: { schema: GenerateQuizInputSchema }, // Use imported schema
  output: { schema: GenerateQuizOutputSchema }, // Use imported schema
  prompt: `You are an AI tasked with creating a multiple-choice quiz based on the provided content.
The quiz should test understanding of the key concepts in the content.

Content Text:
{{{contentText}}}

Please generate exactly {{{numQuestions}}} multiple-choice quiz questions.
Each question must have:
1.  A clear question text ("questionText").
2.  Exactly four distinct options ("options").
3.  The 0-based index of the correct answer within the options array ("correctAnswerIndex").
4.  An optional brief explanation for the correct answer or context for the question ("explanation").

Focus on generating questions that are relevant, clear, and have plausible distractors.
Ensure the options are distinct and the correct answer index is accurate.
`,
});

const generateQuizFlow = ai.defineFlow(
  {
    name: 'generateQuizFlow',
    inputSchema: GenerateQuizInputSchema, // Use imported schema
    outputSchema: GenerateQuizOutputSchema, // Use imported schema
  },
  async (input) => {
    console.log(`Generating quiz with ${input.numQuestions} questions from content of length ${input.contentText.length}.`);
    const { output } = await generateQuizPrompt(input);
    if (!output || !output.questions || output.questions.length === 0) {
      console.warn('AI did not return any questions or output was malformed.');
      // Fallback or throw error
      return { questions: [] }; // Return empty array if AI fails to generate
    }
    console.log(`Successfully generated ${output.questions.length} questions.`);
    return output;
  }
);
