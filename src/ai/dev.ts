'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/generate-focus-tips.ts';
import '@/ai/flows/prioritize-tasks.ts';
import '@/ai/flows/recognize-tasks-flow.ts';
import '@/ai/flows/recognize-investors-flow.ts';
import '@/ai/flows/conciliate-bank-statement-flow.ts';
