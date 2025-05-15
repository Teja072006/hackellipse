'use server';

/**
 * @fileOverview A content validation and description AI agent.
 *
 * - validateAndDescribeContent - A function that handles the content validation and description process.
 * - ValidateAndDescribeContentInput - The input type for the validateAndDescribeContent function.
 * - ValidateAndDescribeContentOutput - The return type for the validateAndDescribeContent function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ValidateAndDescribeContentInputSchema = z.object({
  contentDataUri: z
    .string()
    .describe(
      "The content to validate and describe, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  contentType: z.enum(['video', 'audio', 'text']).describe('The type of the content being uploaded.'),
});
export type ValidateAndDescribeContentInput = z.infer<typeof ValidateAndDescribeContentInputSchema>;

const ValidateAndDescribeContentOutputSchema = z.object({
  isValid: z.boolean().describe('Whether or not the content is considered educational.'),
  description: z.string().describe('A detailed description of the content (1000+ characters).'),
});
export type ValidateAndDescribeContentOutput = z.infer<typeof ValidateAndDescribeContentOutputSchema>;

export async function validateAndDescribeContent(input: ValidateAndDescribeContentInput): Promise<ValidateAndDescribeContentOutput> {
  return validateAndDescribeContentFlow(input);
}

const validateAndDescribeContentPrompt = ai.definePrompt({
  name: 'validateAndDescribeContentPrompt',
  input: {schema: ValidateAndDescribeContentInputSchema},
  output: {schema: ValidateAndDescribeContentOutputSchema},
  prompt: `You are an AI assistant that validates content and generates descriptions for an educational skill-sharing platform.

You will receive content as a data URI and its type. Your task is to determine if the content is educational and generate a detailed description of the content, ensuring the description is at least 1000 characters long.

Content Type: {{{contentType}}}
Content: {{media url=contentDataUri}}

Output the results as a JSON object:
{
  "isValid": true/false, // true if the content is educational, false otherwise
  "description": "..." // A detailed description of the content (1000+ characters)
}`,
});

const validateAndDescribeContentFlow = ai.defineFlow(
  {
    name: 'validateAndDescribeContentFlow',
    inputSchema: ValidateAndDescribeContentInputSchema,
    outputSchema: ValidateAndDescribeContentOutputSchema,
  },
  async input => {
    const {output} = await validateAndDescribeContentPrompt(input);
    return output!;
  }
);
