
'use server';
/**
 * @fileOverview AI flow for generating a multiple-choice quiz from given content.
 *
 * - generateQuiz - A function that handles the quiz generation process.
 * - GenerateQuizInput - The input type for the generateQuiz function.
 * - GenerateQuizOutput - The return type for the generateQuiz function.
 * - QuizQuestion - The structure for a single quiz question.
 */

import {ai} from '@/ai/genkit';
import {z}
from 'genkit';

export const QuizQuestionSchema = z.object({
  questionText: z.string().describe('The text of the quiz question.'),
  options: z.array(z.string()).length(4).describe('An array of exactly four string options for the question.'),
  correctAnswerIndex: z.number().min(0).max(3).describe('The 0-based index of the correct answer in the options array.'),
  explanation: z.string().optional().describe('A brief explanation for why the correct answer is right, or context for the question.'),
});
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export const GenerateQuizInputSchema = z.object({
  contentText: z.string().min(100).describe('The text content from which to generate the quiz. Should be substantial enough for good questions.'),
  numQuestions: z.number().min(1).max(50).describe('The desired number of multiple-choice questions to generate.'),
});
export type GenerateQuizInput = z.infer<typeof GenerateQuizInputSchema>;

export const GenerateQuizOutputSchema = z.object({
  questions: z.array(QuizQuestionSchema).describe('An array of generated quiz questions.'),
});
export type GenerateQuizOutput = z.infer<typeof GenerateQuizOutputSchema>;


export async function generateQuiz(input: GenerateQuizInput): Promise<GenerateQuizOutput> {
  return generateQuizFlow(input);
}

const generateQuizPrompt = ai.definePrompt({
  name: 'generateQuizPrompt',
  input: { schema: GenerateQuizInputSchema },
  output: { schema: GenerateQuizOutputSchema },
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
    inputSchema: GenerateQuizInputSchema,
    outputSchema: GenerateQuizOutputSchema,
  },
  async (input) => {
    console.log(`Generating quiz with ${input.numQuestions} questions.`);
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
