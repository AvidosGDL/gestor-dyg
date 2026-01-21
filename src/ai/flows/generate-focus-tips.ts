'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating focus tips based on a task description.
 *
 * It exports:
 * - `generateFocusTips`: An async function that takes a task description and returns focus tips.
 * - `FocusTipsInput`: The input type for the generateFocusTips function.
 * - `FocusTipsOutput`: The output type for the generateFocusTips function.
 */

import {ai} from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import {z} from 'genkit';

const FocusTipsInputSchema = z.object({
  taskDescription: z.string().describe('The description of the task the user is working on.'),
});
export type FocusTipsInput = z.infer<typeof FocusTipsInputSchema>;

const FocusTipsOutputSchema = z.object({
  focusTips: z.array(z.string()).describe('An array of personalized tips to stay focused on the task.'),
});
export type FocusTipsOutput = z.infer<typeof FocusTipsOutputSchema>;

export async function generateFocusTips(input: FocusTipsInput): Promise<FocusTipsOutput> {
  return generateFocusTipsFlow(input);
}

const focusTipsPrompt = ai.definePrompt({
  name: 'focusTipsPrompt',
  model: googleAI.model('gemini-pro'),
  input: {schema: FocusTipsInputSchema},
  output: {schema: FocusTipsOutputSchema},
  prompt: `You are a productivity expert. Given the following task description, generate 3 personalized tips to help the user stay focused on the task.

Task Description: {{{taskDescription}}}

Focus Tips:`,
});

const generateFocusTipsFlow = ai.defineFlow(
  {
    name: 'generateFocusTipsFlow',
    inputSchema: FocusTipsInputSchema,
    outputSchema: FocusTipsOutputSchema,
  },
  async input => {
    const {output} = await focusTipsPrompt(input);
    return output!;
  }
);
