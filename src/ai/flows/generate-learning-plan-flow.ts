
'use server';
/**
 * @fileOverview AI flow for generating a structured learning plan for a given skill.
 *
 * - generateLearningPlan - A function that handles the learning plan generation process.
 * - GenerateLearningPlanInput - The input type for the generateLearningPlan function.
 * - GenerateLearningPlanOutput - The return type for the generateLearningPlan function.
 * - LearningMilestone - The structure for a single learning milestone.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit'; // Genkit's Zod

// Schema for a single learning milestone
const LearningMilestoneSchema = z.object({
  milestoneTitle: z.string().describe('A concise title for this learning milestone or topic (e.g., "Understanding Core Concepts", "Setting up Your Environment").'),
  description: z.string().describe('A detailed description of what the user should learn or achieve in this milestone (2-4 sentences).'),
  estimatedDuration: z.string().describe('A rough estimate of how long this milestone might take (e.g., "3-5 days", "1 week", "2-3 hours").'),
  suggestedSearchKeywords: z.array(z.string()).describe('An array of 3-5 relevant keywords or short phrases the user can search for on SkillForge to find content related to this milestone.'),
  externalResourceSuggestions: z.array(z.string()).optional().describe('An array of 2-3 general topics, types of resources (e.g., "official documentation", "research papers"), or broader search queries for finding supplementary information on the general web. Provide this only if the milestone covers very niche, highly specific, or advanced concepts that might not be extensively covered on a typical skill-sharing platform like SkillForge.'),
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
  milestones: z.array(LearningMilestoneSchema).min(3).max(10).describe('An array of learning milestones, typically 3 to 7 milestones, ordered logically to guide the user from basics to more advanced topics.'),
});
export type GenerateLearningPlanOutput = z.infer<typeof GenerateLearningPlanOutputSchema>;

// Exported async function that client components will call
export async function generateLearningPlan(input: GenerateLearningPlanInput): Promise<GenerateLearningPlanOutput> {
  console.log('[generateLearningPlan Flow] Called with skill:', input.skillName);
  try {
    const result = await generateLearningPlanFlow(input);
    console.log('[generateLearningPlan Flow] Successfully generated plan for:', input.skillName);
    return result;
  } catch (error: any) {
    console.error('[generateLearningPlan Flow] Error generating plan:', error);
    // Re-throw a more generic error or a structured one if preferred
    throw new Error(`Failed to generate learning plan: ${error.message || 'Unknown AI error'}`);
  }
}

// Genkit prompt definition
const generateLearningPlanPrompt = ai.definePrompt({
  name: 'generateLearningPlanPrompt',
  input: { schema: GenerateLearningPlanInputSchema },
  output: { schema: GenerateLearningPlanOutputSchema },
  prompt: `You are an expert curriculum designer and learning strategist for SkillForge, an online learning platform.
A user wants to learn the skill: "{{skillName}}".

Your task is to generate a structured, actionable, and encouraging learning plan to help them achieve proficiency in this skill.
The plan should consist of several logical milestones, progressing from foundational concepts to more advanced topics or practical application.

For each milestone, provide:
1.  A concise "milestoneTitle".
2.  A "description" of what the user should focus on or achieve in that milestone (2-4 sentences).
3.  An "estimatedDuration" (e.g., "1-2 days", "1 week").
4.  An array of 3-5 "suggestedSearchKeywords" - these are specific terms or short phrases the user can type into the SkillForge search bar to find relevant video, audio, or text content for that milestone. These keywords should be highly relevant and practical for finding learning materials on the SkillForge platform.
5.  Optionally, an array of 2-3 "externalResourceSuggestions". Populate this field ONLY if the milestone covers a very niche, highly specific, or advanced topic that you believe might benefit from supplementary resources beyond a typical skill-sharing platform. These suggestions should be general search queries or types of resources to look for on the broader web (e.g., "official [library_name] documentation", "research papers on [specific_algorithm]", "in-depth tutorials for [advanced_framework_feature]"). Do NOT provide specific URLs.

The overall plan should have:
- "skillToLearn": Echo back the skill name provided by the user.
- "planTitle": A catchy and descriptive title for the entire learning plan.
- "overview": A brief, encouraging overview (2-3 sentences) of the learning journey.
- "milestones": An array of 3 to 7 milestones. Ensure the milestones are ordered logically.

Example of a milestone's suggestedSearchKeywords for "Learning Guitar":
["guitar chords for beginners", "basic strumming patterns", "how to hold a guitar", "easy guitar songs"]

Example of externalResourceSuggestions for a niche topic like "Quantum Entanglement in Q#":
["microsoft qsharp quantum katas", "qiskit textbook quantum entanglement", "research papers on bell states"]

Focus on clarity, actionability, and providing useful search keywords for SkillForge.
The "estimatedDuration" should be realistic for a self-paced learner.
The "description" for each milestone should clearly state the learning objectives for that stage.
`,
});

// Genkit flow definition
const generateLearningPlanFlow = ai.defineFlow(
  {
    name: 'generateLearningPlanFlow',
    inputSchema: GenerateLearningPlanInputSchema,
    outputSchema: GenerateLearningPlanOutputSchema,
  },
  async (input) => {
    console.log(`[generateLearningPlanFlow Genkit] Generating learning plan for skill: ${input.skillName}`);
    const { output } = await generateLearningPlanPrompt(input);

    if (!output || !output.milestones || output.milestones.length === 0) {
      console.warn('[generateLearningPlanFlow Genkit] AI did not return a valid plan or milestones. Raw output:', output);
      throw new Error('AI failed to generate a valid learning plan. The output was empty or malformed.');
    }
    
    // Basic validation of the output structure
    if (output.milestones.some(m => !m.milestoneTitle || !m.description || !m.estimatedDuration || !m.suggestedSearchKeywords || m.suggestedSearchKeywords.length === 0)) {
        console.warn('[generateLearningPlanFlow Genkit] AI returned milestones with missing required fields. Raw output:', output);
        throw new Error('AI generated a plan with incomplete milestones. Some required fields are missing.');
    }

    console.log(`[generateLearningPlanFlow Genkit] Successfully generated ${output.milestones.length} milestones for plan: "${output.planTitle}"`);
    return output;
  }
);

