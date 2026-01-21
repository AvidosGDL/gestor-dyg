'use server';
/**
 * @fileOverview A Genkit flow for recognizing handwritten tasks from an image.
 *
 * This file defines:
 * - recognizeTasksFromImage: An async function that takes an image data URI and returns a list of task titles.
 * - RecognizeTasksInput: The Zod schema for the flow's input.
 * - RecognizeTasksOutput: The Zod schema for the flow's output.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'zod';

const RecognizeTasksInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "A photo of handwritten text, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type RecognizeTasksInput = z.infer<typeof RecognizeTasksInputSchema>;

const TaskTitleSchema = z.object({
  title: z.string().describe('The recognized title of a single task.'),
});

const RecognizeTasksOutputSchema = z.object({
  tasks: z
    .array(TaskTitleSchema)
    .describe('An array of task titles recognized from the image.'),
});
export type RecognizeTasksOutput = z.infer<typeof RecognizeTasksOutputSchema>;

export async function recognizeTasksFromImage(
  input: RecognizeTasksInput
): Promise<RecognizeTasksOutput> {
  return recognizeTasksFlow(input);
}

const recognizeTasksPrompt = ai.definePrompt({
  name: 'recognizeTasksPrompt',
  model: googleAI.model('gemini-pro-vision'),
  input: { schema: RecognizeTasksInputSchema },
  output: { schema: RecognizeTasksOutputSchema },
  prompt: `You are an expert in recognizing handwritten text from an image. Analyze the provided image and extract a list of distinct tasks. Each item in the list should be a single task.

Image: {{media url=imageDataUri}}`,
});

const recognizeTasksFlow = ai.defineFlow(
  {
    name: 'recognizeTasksFlow',
    inputSchema: RecognizeTasksInputSchema,
    outputSchema: RecognizeTasksOutputSchema,
  },
  async (input) => {
    const { output } = await recognizeTasksPrompt(input);
    return output!;
  }
);
