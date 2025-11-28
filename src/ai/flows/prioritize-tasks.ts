'use server';

/**
 * @fileOverview A task prioritization AI agent.
 *
 * - prioritizeTasks - A function that handles the task prioritization process.
 * - PrioritizeTasksInput - The input type for the prioritizeTasks function.
 * - PrioritizeTasksOutput - The return type for the prioritizeTasks function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TaskSchema = z.object({
  id: z.number().describe('The unique identifier of the task.'),
  title: z.string().describe('The title of the task.'),
  client: z.string().describe('The project or client associated with the task.'),
  progress: z.number().describe('The completion progress of the task as a percentage (0-100).'),
  dueDate: z.string().optional().describe('The due date of the task in ISO 8601 format (YYYY-MM-DD).'),
  status: z.string().describe('The current status of the task (e.g., prospecting, negotiation, closing, done).'),
  priority: z.string().describe('The current priority of the task (e.g., high, medium, low).'),
  delegateTo: z.string().optional().describe('The person to whom the task is delegated.'),
  description: z.string().optional().describe('A detailed description of the task.'),
  value: z.number().describe('The potential value of the task in dollars.'),
  probability: z.number().describe('The probability of success of the task as a percentage (0-100).'),
});

const PrioritizeTasksInputSchema = z.array(TaskSchema).describe('An array of tasks to prioritize.');
export type PrioritizeTasksInput = z.infer<typeof PrioritizeTasksInputSchema>;

const PrioritizeTasksOutputSchema = z.array(TaskSchema).describe('An array of tasks, re-ordered by priority.');
export type PrioritizeTasksOutput = z.infer<typeof PrioritizeTasksOutputSchema>;

export async function prioritizeTasks(input: PrioritizeTasksInput): Promise<PrioritizeTasksOutput> {
  const result = await prioritizeTasksFlow(input);
  return result;
}


const prompt = ai.definePrompt({
  name: 'prioritizeTasksPrompt',
  input: {schema: PrioritizeTasksInputSchema},
  output: {schema: PrioritizeTasksOutputSchema},
  prompt: `You are an expert project manager. Given the following list of tasks, re-order them by priority, with the most critical tasks first. Consider due date, priority level, value, probability, and who it's delegated to. Return the tasks in the re-ordered list.

Tasks:
{{#each this}}
- ID: {{this.id}}, Title: {{this.title}}, Project/Client: {{this.client}}, Progress: {{this.progress}}%, Due Date: {{this.dueDate}}, Status: {{this.status}}, Priority: {{this.priority}}, Delegated To: {{this.delegateTo}}, Description: {{this.description}}, Value: {{this.value}}, Probability: {{this.probability}}
{{/each}}`,
});

const prioritizeTasksFlow = ai.defineFlow(
  {
    name: 'prioritizeTasksFlow',
    inputSchema: PrioritizeTasksInputSchema,
    outputSchema: PrioritizeTasksOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
