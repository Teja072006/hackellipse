
import { config } from 'dotenv';
config();

import '@/ai/flows/validate-and-describe-content.ts';
import '@/ai/flows/ai-content-chatbot-tutor.ts';
import '@/ai/flows/global-ai-chatbot-flow.ts';
import '@/ai/flows/generate-quiz-flow.ts';
import '@/ai/flows/suggest-quiz-feedback-flow.ts';
import '@/ai/flows/generate-learning-plan-flow.ts'; // Added new learning plan flow

