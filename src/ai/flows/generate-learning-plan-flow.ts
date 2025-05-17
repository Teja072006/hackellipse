
'use server';
/**
 * @fileOverview AI flow for generating a structured learning plan for a given skill,
 * including milestone-specific quizzes and content search suggestions.
 *
 * - generateLearningPlan - A function that handles the learning plan generation process.
 * - GenerateLearningPlanInput - The input type for the generateLearningPlan function.
 * - GenerateLearningPlanOutput - The return type for the generateLearningPlan function.
 * - LearningMilestone - The structure for a single learning milestone, including an optional quiz.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit'; // Genkit's Zod
import { QuizQuestionSchema, type QuizQuestion } from '@/ai/schemas/quiz-schemas'; // Import QuizQuestionSchema

// Schema for a single learning milestone
const LearningMilestoneSchema = z.object({
  milestoneTitle: z.string().describe('A concise title for this learning milestone or topic (e.g., "Understanding Core Concepts", "Setting up Your Environment").'),
  description: z.string().describe('A detailed description of what the user should learn or achieve in this milestone (2-4 sentences).'),
  estimatedDuration: z.string().describe('A rough estimate of how long this milestone might take (e.g., "3-5 days", "1 week", "2-3 hours").'),
  suggestedSearchKeywords: z.array(z.string()).describe('An array of 3-5 relevant keywords or short phrases the user can search for on SkillForge to find content related to this milestone. These should be highly specific to SkillForge content.'),
  externalResourceSuggestions: z.array(z.string()).optional().describe('An array of 2-3 general topics, types of resources (e.g., "official documentation for X library", "research papers on Y algorithm"), or broader search queries for finding supplementary information on the general web. Provide this ONLY if the milestone covers very niche, highly specific, or advanced concepts that might not be extensively covered on SkillForge.'),
  quiz: z.array(QuizQuestionSchema).optional().describe("An optional short quiz of 3-5 multiple-choice questions specific to this milestone's content. Each question should have 'questionText', 'options' (array of 4 strings), 'correctAnswerIndex' (0-3), and an optional 'explanation'.")
});
export type LearningMilestone = z.infer<typeof LearningMilestoneSchema>;

// Schema for the input to the learning plan generation flow
const GenerateLearningPlanInputSchema = z.object({
  skillName: z.string().min(3).describe('The name of the skill the user wants to learn (e.g., "React Native development", "Advanced JavaScript", "Digital Marketing Basics").'),
});
export type GenerateLearningPlanInput = z.infer<typeof GenerateLearningPlanInputSchema>;

// Schema for the output of the learning plan generation flow
const GenerateLearningPlanOutputSchema = z.object({
  skillToLearn: z.string().describe('The skill name that the plan is for, as provided by the user.'),
  planTitle: z.string().describe('A catchy and descriptive title for the generated learning plan (e.g., "Your Journey to Mastering React Native", "Comprehensive Guide to JavaScript").'),
  overview: z.string().describe('A brief overview (2-3 sentences) of the learning journey and what the user can expect to achieve by following this plan.'),
  milestones: z.array(LearningMilestoneSchema).describe('An array of learning milestones, typically 3 to 7 milestones, ordered logically to guide the user from basics to more advanced topics. Each milestone should be actionable.'),
});
export type GenerateLearningPlanOutput = z.infer<typeof GenerateLearningPlanOutputSchema>;

// Exported async function that client components will call
export async function generateLearningPlan(input: GenerateLearningPlanInput): Promise<GenerateLearningPlanOutput> {
  console.log('[generateLearningPlan Flow] Called with skill:', input.skillName);
  try {
    const result = await generateLearningPlanFlow(input);
    console.log('[generateLearningPlan Flow] Successfully generated plan for:', input.skillName);

    if (!result.milestones || result.milestones.length === 0) {
        throw new Error("AI generated a plan with no milestones.");
    }

    // Validate essential fields for each milestone
    const incompleteMilestones = result.milestones.filter(m => 
        !m.milestoneTitle || 
        !m.description || 
        !m.estimatedDuration || 
        !m.suggestedSearchKeywords || 
        m.suggestedSearchKeywords.length === 0
    );

    if (incompleteMilestones.length > 0) {
        console.warn('[generateLearningPlan Flow] AI generated incomplete milestones:', incompleteMilestones.map(m => m.milestoneTitle || "Untitled"));
        throw new Error("AI generated an incomplete plan. Some milestones are missing essential details (title, description, duration, or search keywords). Please try rephrasing your skill or try again.");
    }

    result.milestones.forEach(m => {
        if (m.quiz && m.quiz.length > 0) {
            if (m.quiz.some(q => !q.questionText || !q.options || q.options.length !== 4 || q.correctAnswerIndex === undefined || q.correctAnswerIndex < 0 || q.correctAnswerIndex > 3)) {
                console.warn(`[generateLearningPlan Flow] Milestone (title: "${m.milestoneTitle}") has a malformed quiz. Proceeding without this quiz for this milestone.`, m.quiz);
                m.quiz = []; // Clear malformed quiz to prevent client errors for this specific milestone
            }
        }
    });
    return result;
  } catch (error: any) {
    console.error('[generateLearningPlan Flow] Error generating plan:', {
      message: error.message,
      stack: error.stack,
      details: error.details,
      cause: error.cause,
    });
    throw new Error(`Failed to generate learning plan: ${error.message || 'Unknown AI error'}`);
  }
}

// Genkit prompt definition
const generateLearningPlanPrompt = ai.definePrompt({
  name: 'generateLearningPlanPrompt',
  input: { schema: GenerateLearningPlanInputSchema },
  output: { schema: GenerateLearningPlanOutputSchema }, // Simplified constraints here for the AI
  prompt: `You are an expert curriculum designer and learning strategist for SkillForge, an online learning platform.
A user wants to learn the skill: "{{skillName}}".

Your task is to generate a structured, actionable, and encouraging learning plan to help them achieve proficiency in this skill.
The plan should consist of several logical milestones (aim for 3 to 7 milestones), progressing from foundational concepts to more advanced topics or practical application.

For each milestone, you MUST provide:
1.  A concise "milestoneTitle".
2.  A "description" of what the user should focus on or achieve in that milestone (2-4 sentences).
3.  An "estimatedDuration" (e.g., "1-2 days", "1 week").
4.  An array of 3-5 "suggestedSearchKeywords" - these are specific terms or short phrases the user can type into the SkillForge platform's search bar to find relevant video, audio, or text content for that milestone. Keywords should be highly relevant to SkillForge content.

Optionally, for each milestone, you can also provide:
5.  An array of 2-3 "externalResourceSuggestions". Populate this field ONLY if the milestone covers a very niche, highly specific, or advanced topic that you believe might benefit from supplementary resources beyond SkillForge. These suggestions should be general search queries or types of resources to look for on the broader web (e.g., "official [library_name] documentation", "research papers on [specific_algorithm]"). Do NOT provide specific URLs.
6.  A short "quiz" of 3 to 5 multiple-choice questions directly related to the content and objectives of THIS milestone. Each quiz question must have:
    a. "questionText": The text of the quiz question.
    b. "options": An array of exactly four distinct string options.
    c. "correctAnswerIndex": The 0-based index of the correct answer in the options array.
    d. "explanation": (Optional) A brief explanation for the correct answer.
    Ensure quiz questions are clear, relevant, and test understanding of the milestone's key concepts.

The overall plan should have:
- "skillToLearn": Echo back the skill name provided by the user.
- "planTitle": A catchy and descriptive title for the entire learning plan.
- "overview": A brief, encouraging overview (2-3 sentences) of the learning journey.
- "milestones": An array of logically ordered milestones.

Focus on clarity, actionability, providing useful SkillForge search keywords, and creating relevant milestone-specific quizzes where appropriate.
The "estimatedDuration" should be realistic for a self-paced learner.
The "description" for each milestone should clearly state the learning objectives for that stage.
Ensure all required fields for each milestone are populated.
`,
});

// Genkit flow definition
const generateLearningPlanFlow = ai.defineFlow(
  {
    name: 'generateLearningPlanFlow',
    inputSchema: GenerateLearningPlanInputSchema,
    outputSchema: GenerateLearningPlanOutputSchema, // Using the schema with relaxed array constraints for AI generation
  },
  async (input) => {
    console.log(`[generateLearningPlanFlow Genkit] Generating learning plan for skill: ${input.skillName}`);
    const { output } = await generateLearningPlanPrompt(input);

    if (!output || !output.milestones || output.milestones.length === 0) {
      console.warn('[generateLearningPlanFlow Genkit] AI did not return a valid plan or milestones. Raw output:', output);
      throw new Error('AI failed to generate a valid learning plan. The output was empty or had no milestones.');
    }
    
    // Initial check for presence of core milestone fields done in the wrapper function now for stricter error throwing.
    // The Zod schema itself will validate types.

    // Validate quiz structure if present in the AI's output more robustly
    output.milestones.forEach((m, index) => {
        if (m.quiz && m.quiz.length > 0) {
            if (m.quiz.some(q => !q.questionText || !q.options || q.options.length !== 4 || q.correctAnswerIndex === undefined || q.correctAnswerIndex < 0 || q.correctAnswerIndex > 3)) {
                console.warn(`[generateLearningPlanFlow Genkit] Milestone ${index + 1} (title: "${m.milestoneTitle}") has a malformed quiz from AI. Removing quiz for this milestone. Raw milestone quiz:`, m.quiz);
                m.quiz = []; // Clear malformed quiz to prevent client errors, but don't fail the whole plan from here.
            }
        }
    });

    console.log(`[generateLearningPlanFlow Genkit] Successfully generated ${output.milestones.length} milestones for plan: "${output.planTitle}"`);
    return output;
  }
);

