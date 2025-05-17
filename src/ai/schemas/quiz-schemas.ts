// src/ai/schemas/quiz-schemas.ts
import {z} from 'genkit';

export const QuizQuestionSchema = z.object({
  questionText: z.string().describe('The text of the quiz question.'),
  options: z.array(z.string()).length(4).describe('An array of exactly four string options for the question.'),
  correctAnswerIndex: z.number().min(0).max(3).describe('The 0-based index of the correct answer in the options array.'),
  explanation: z.string().optional().describe('A brief explanation for why the correct answer is right, or context for the question.'),
});
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export const GenerateQuizInputSchema = z.object({
  contentText: z.string().min(50).describe('The text content from which to generate the quiz. Should be substantial enough for good questions.'), // Reduced min length for testing
  numQuestions: z.number().min(1).max(10).describe('The desired number of multiple-choice questions to generate (between 1 and 10).'),
});
export type GenerateQuizInput = z.infer<typeof GenerateQuizInputSchema>;

export const GenerateQuizOutputSchema = z.object({
  questions: z.array(QuizQuestionSchema).describe('An array of generated quiz questions.'),
});
export type GenerateQuizOutput = z.infer<typeof GenerateQuizOutputSchema>;


// Schema for sending quiz results to the feedback AI
export const QuizQuestionWithResultSchema = QuizQuestionSchema.extend({
    userAnswerIndex: z.number().min(0).max(3).optional().describe("The 0-based index of the user's selected answer."),
    isCorrect: z.boolean().describe("Whether the user's answer was correct.")
});
export type QuizQuestionWithResult = z.infer<typeof QuizQuestionWithResultSchema>;

// Schemas for SuggestQuizFeedbackFlow
export const SuggestQuizFeedbackInputSchema = z.object({
  contentText: z.string().describe('The original content text the quiz was based on.'),
  quizResults: z.array(QuizQuestionWithResultSchema).describe('An array of quiz questions, including user answers and correctness.'),
});
export type SuggestQuizFeedbackInput = z.infer<typeof SuggestQuizFeedbackInputSchema>;

export const SuggestQuizFeedbackOutputSchema = z.object({
  feedbackText: z.string().describe('Personalized feedback for the user, highlighting areas for improvement.'),
});
export type SuggestQuizFeedbackOutput = z.infer<typeof SuggestQuizFeedbackOutputSchema>;
