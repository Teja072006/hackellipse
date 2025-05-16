import { config } from 'dotenv';
config();

import '@/ai/flows/validate-and-describe-content.ts';
import '@/ai/flows/ai-content-chatbot-tutor.ts';
import '@/ai/flows/global-ai-chatbot-flow.ts'; // Added new global chatbot flow
