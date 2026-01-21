'use server';
/**
 * @fileOverview A Genkit flow for recognizing bank transactions from images or PDFs.
 *
 * This file defines:
 * - recognizeBankTransactions: An async function that takes files and returns structured transaction data.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'zod';

export type RecognizeBankTransactionsInput = z.infer<typeof RecognizeBankTransactionsInputSchema>;
const RecognizeBankTransactionsInputSchema = z.object({
  files: z.array(
    z.object({
      dataUri: z.string().describe('A file (PDF or image) as a data URI.'),
      fileName: z.string(),
    })
  ),
});

const RecognizedTransactionSchema = z.object({
  date: z.string().describe('The transaction date in YYYY-MM-DD format.'),
  amount: z.number().describe('The total amount of the transaction.'),
  description: z
    .string()
    .describe(
      'A brief description of the transaction (e.g., vendor name).'
    ),
  type: z.enum(['ingreso', 'egreso']).describe('The type of transaction.'),
  originalFileName: z
    .string()
    .describe(
      'The original name of the file this transaction was extracted from.'
    ),
});

export type RecognizeBankTransactionsOutput = z.infer<
  typeof RecognizeBankTransactionsOutputSchema
>;
const RecognizeBankTransactionsOutputSchema = z.object({
  transactions: z.array(RecognizedTransactionSchema),
});

export async function recognizeBankTransactions(
  input: RecognizeBankTransactionsInput
): Promise<RecognizeBankTransactionsOutput> {
  return recognizeBankTransactionsFlow(input);
}

const recognizeTransactionsPrompt = ai.definePrompt({
  name: 'recognizeBankTransactionsPrompt',
  model: googleAI.model('gemini-1.5-flash'),
  input: { schema: RecognizeBankTransactionsInputSchema },
  output: { schema: RecognizeBankTransactionsOutputSchema },
  prompt: `You are an expert accounting assistant specialized in optical character recognition (OCR) from receipts and invoices.
Your task is to analyze the provided files (images or PDFs) and extract transaction details.

For each file, perform the following steps:
1.  Identify the total amount of the transaction. It's usually the largest number or labeled as 'TOTAL', 'PAGO', or similar.
2.  Find the date of the transaction. Format it as YYYY-MM-DD.
3.  Generate a brief, clear description. This is often the name of the vendor, store, or service provider at the top of the document (e.g., "Starbucks", "CFE", "Pago de Nómina"). If a clear vendor is not available, use the original file name as a fallback.
4.  Determine if it is an expense ('egreso') or an income ('ingreso'). Most receipts for purchases are expenses. A payment to a credit card ('PAGO A TDC') is an 'egreso'.
5.  Match the extracted details to the original file name provided.

Return a single JSON object containing a list of all extracted transactions.

Files to process:
{{#each files}}
---
File Name: {{this.fileName}}
File Content: {{media url=this.dataUri}}
---
{{/each}}
`,
});

const recognizeBankTransactionsFlow = ai.defineFlow(
  {
    name: 'recognizeBankTransactionsFlow',
    inputSchema: RecognizeBankTransactionsInputSchema,
    outputSchema: RecognizeBankTransactionsOutputSchema,
  },
  async (input) => {
    const { output } = await recognizeTransactionsPrompt(input);
    return output!;
  }
);
