// src/ai/flows/suggest-quiz-feedback-flow.ts
'use server';
/**
 * @fileOverview AI flow for generating personalized feedback on quiz performance.
 *
 * - suggestQuizFeedbackFlowWrapper - A function that handles the feedback generation process.
 * - SuggestQuizFeedbackInput - The input type (imported).
 * - SuggestQuizFeedbackOutput - The return type (imported).
 * - QuizQuestionWithResult - The structure for a single quiz question with user's result (imported).
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {
  QuizQuestionWithResultSchema, // For detailed results
  type QuizQuestionWithResult
} from '@/ai/schemas/quiz-schemas'; // Import from the new schemas file

export const SuggestQuizFeedbackInputSchema = z.object({
  contentText: z.string().describe('The original content text the quiz was based on.'),
  quizResults: z.array(QuizQuestionWithResultSchema).describe('An array of quiz questions, including user answers and correctness.'),
});
export type SuggestQuizFeedbackInput = z.infer<typeof SuggestQuizFeedbackInputSchema>;

export const SuggestQuizFeedbackOutputSchema = z.object({
  feedbackText: z.string().describe('Personalized feedback for the user, highlighting areas for improvement.'),
});
export type SuggestQuizFeedbackOutput = z.infer<typeof SuggestQuizFeedbackOutputSchema>;

// Re-export types for convenience if they are used by client components
export type { QuizQuestionWithResult };


export async function suggestQuizFeedbackFlowWrapper(input: SuggestQuizFeedbackInput): Promise<SuggestQuizFeedbackOutput> {
  console.log("SuggestQuizFeedbackFlowWrapper called with input:", {
    contentTextLength: input.contentText.length,
    quizResultsCount: input.quizResults.length,
  });
  try {
    const result = await suggestQuizFeedbackFlow(input);
    console.log("SuggestQuizFeedbackFlowWrapper received result:", result);
    return result;
  } catch (error) {
    console.error("Error in suggestQuizFeedbackFlowWrapper:", error);
    throw error; // Re-throw to be caught by the caller
  }
}

const suggestQuizFeedbackPrompt = ai.definePrompt({
  name: 'suggestQuizFeedbackPrompt',
  input: { schema: SuggestQuizFeedbackInputSchema },
  output: { schema: SuggestQuizFeedbackOutputSchema },
  prompt: `You are a helpful AI learning assistant.
The user has just completed a quiz based on the provided content text.
Analyze their incorrect answers and the original content to provide constructive feedback.
Identify 2-3 key topics or concepts from the content that the user seems to be weak on, based on their incorrect answers.
Provide specific, actionable advice or point to sections in the content they should review.
Keep the feedback concise, encouraging, and focused on improvement.

Original Content Text:
---
{{{contentText}}}
---

User's Quiz Results (questions they answered, their answer, and if it was correct):
---
{{#each quizResults}}
Question {{add @index 1}}: {{this.questionText}}
Options:
{{#each this.options}}
  {{add @index 1}}. {{this}}
{{/each}}
Correct Answer Index: {{this.correctAnswerIndex}} (Option {{add this.correctAnswerIndex 1}})
User's Answer Index: {{#if this.userAnswerIndex}}{{this.userAnswerIndex}}{{else}}Not Answered{{/if}} (Option {{#if this.userAnswerIndex}}{{add this.userAnswerIndex 1}}{{else}}N/A{{/if}})
User was Correct: {{this.isCorrect}}
{{#unless this.isCorrect}}
Explanation (if available): {{this.explanation}}
{{/unless}}
---
{{/each}}

Based on the incorrect answers, provide personalized feedback.
`,
});

const suggestQuizFeedbackFlow = ai.defineFlow(
  {
    name: 'suggestQuizFeedbackFlow',
    inputSchema: SuggestQuizFeedbackInputSchema,
    outputSchema: SuggestQuizFeedbackOutputSchema,
  },
  async (input) => {
    console.log(`Generating feedback for content of length ${input.contentText.length} and ${input.quizResults.length} quiz results.`);
    const { output } = await suggestQuizFeedbackPrompt(input);
    if (!output || !output.feedbackText) {
      console.warn('AI did not return any feedback or output was malformed.');
      return { feedbackText: "I'm sorry, I couldn't generate specific feedback for this attempt. Try reviewing the questions and content again." };
    }
    console.log(`Successfully generated feedback: "${output.feedbackText.substring(0,100)}..."`);
    return output;
  }
);
