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
import {z} from 'genkit'; // Genkit's Zod
import {
  SuggestQuizFeedbackInputSchema,
  SuggestQuizFeedbackOutputSchema,
  type SuggestQuizFeedbackInput,
  type SuggestQuizFeedbackOutput,
  type QuizQuestionWithResult
} from '@/ai/schemas/quiz-schemas';

// Re-export types for convenience if they are used by client components
export type { SuggestQuizFeedbackInput, SuggestQuizFeedbackOutput, QuizQuestionWithResult };

export async function suggestQuizFeedbackFlowWrapper(input: SuggestQuizFeedbackInput): Promise<SuggestQuizFeedbackOutput> {
  console.log("[SuggestQuizFeedbackFlowWrapper] Called with input:", {
    contentTextLength: input.contentText.length,
    quizResultsCount: input.quizResults.length,
  });
  try {
    const result = await suggestQuizFeedbackFlow(input);
    console.log("[SuggestQuizFeedbackFlowWrapper] Received result from flow:", result);
    return result;
  } catch (error: any) {
    console.error("[SuggestQuizFeedbackFlowWrapper] Error during flow execution:", {
        message: error.message,
        stack: error.stack,
        details: error.details, // For Genkit/structured errors
        cause: error.cause // For chained errors
    });
    return { feedbackText: "I'm sorry, an error occurred while generating feedback. Please check server logs for more details and try again later." };
  }
}

// Define a new schema for the simplified prompt input
const SimplifiedSuggestQuizFeedbackInputSchema = z.object({
  contentText: z.string().describe('The original content text the quiz was based on.'),
  quizResultsText: z.string().describe("A formatted string detailing the user's quiz performance."),
});

const simplifiedSuggestQuizFeedbackPrompt = ai.definePrompt({
  name: 'simplifiedSuggestQuizFeedbackPrompt',
  input: { schema: SimplifiedSuggestQuizFeedbackInputSchema },
  output: { schema: SuggestQuizFeedbackOutputSchema },
  prompt: `You are a helpful AI learning assistant.
The user has just completed a quiz based on the provided content text.
Analyze their incorrect answers (detailed below) and the original content text to provide constructive feedback.
Identify 2-3 key topics or concepts from the content that the user seems to be weak on, based on their incorrect answers.
Provide specific, actionable advice or point to sections in the content text they should review.
Keep the feedback concise, encouraging, and focused on improvement.

Original Content Text:
---
{{{contentText}}}
---

User's Quiz Results (questions they answered, their answer, and if it was correct):
---
{{{quizResultsText}}}
---

Based on the incorrect answers, provide personalized feedback.
If all answers were correct, congratulate the user and perhaps suggest a next step or related topic if appropriate from the content.
`,
});


const suggestQuizFeedbackFlow = ai.defineFlow(
  {
    name: 'suggestQuizFeedbackFlow',
    inputSchema: SuggestQuizFeedbackInputSchema, // Still use the original detailed input schema for the flow function
    outputSchema: SuggestQuizFeedbackOutputSchema,
  },
  async (input) => {
    console.log(`[suggestQuizFeedbackFlow] Generating feedback for content of length ${input.contentText.length} and ${input.quizResults.length} quiz results.`);

    // Pre-process quizResults into a simple string for the prompt
    let quizResultsText = "";
    if (input.quizResults.length === 0) {
        quizResultsText = "No quiz results provided.";
    } else {
        input.quizResults.forEach((result, index) => {
            quizResultsText += `Question ${index + 1}: ${result.questionText}\n`;
            quizResultsText += `Options:\n`;
            result.options.forEach((opt, oIndex) => {
                quizResultsText += `  ${oIndex + 1}. ${opt}\n`;
            });
            quizResultsText += `Correct Answer: Option ${result.correctAnswerIndex + 1} (${result.options[result.correctAnswerIndex]})\n`;
            if (result.userAnswerIndex !== undefined && result.userAnswerIndex !== null) {
                quizResultsText += `User's Answer: Option ${result.userAnswerIndex + 1} (${result.options[result.userAnswerIndex]})\n`;
            } else {
                quizResultsText += `User's Answer: Not Answered\n`;
            }
            quizResultsText += `User was Correct: ${result.isCorrect}\n`;
            if (!result.isCorrect && result.explanation) {
                quizResultsText += `Explanation/Hint for this question: ${result.explanation}\n`;
            }
            quizResultsText += `---\n`;
        });
    }
    
    const simplifiedPromptInput = {
        contentText: input.contentText,
        quizResultsText: quizResultsText
    };

    console.log(`[suggestQuizFeedbackFlow] Simplified input for prompt: Content length: ${simplifiedPromptInput.contentText.length}, Quiz results text snippet: "${simplifiedPromptInput.quizResultsText.substring(0,150)}..."`);

    try {
        const { output } = await simplifiedSuggestQuizFeedbackPrompt(simplifiedPromptInput);
        
        if (!output || !output.feedbackText) {
          console.warn('[suggestQuizFeedbackFlow] AI did not return any feedback or output was malformed. Raw output:', output);
          return { feedbackText: "I'm sorry, I couldn't generate specific feedback for this attempt. Try reviewing the questions and content again." };
        }
        console.log(`[suggestQuizFeedbackFlow] Successfully generated feedback: "${output.feedbackText.substring(0,100)}..."`);
        return output;

    } catch (aiError: any) {
        console.error("[suggestQuizFeedbackFlow] Error during AI prompt execution:", {
            message: aiError.message,
            stack: aiError.stack,
            details: aiError.details,
            cause: aiError.cause
        });
        // Re-throw the error so it can be caught by the wrapper and handled there
        // This allows the wrapper to return a generic message to the client.
        throw aiError; 
    }
  }
);
