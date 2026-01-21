'use server';
/**
 * @fileOverview A Genkit flow for conciliating bank statements.
 *
 * This file defines:
 * - conciliateStatement: An async function that takes a PDF and existing transactions.
 * - ConciliationInput: The Zod schema for the flow's input.
 * - ConciliationOutput: The Zod schema for the flow's output.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const BankTransactionSchema = z.object({
    id: z.string(),
    date: z.string(),
    description: z.string(),
    amount: z.number(),
    type: z.enum(['ingreso', 'egreso']),
    source: z.enum(['manual', 'import_csv', 'conciliado_pdf', 'import_file']),
});

export const ConciliationInputSchema = z.object({
  statementPdfUri: z
    .string()
    .describe(
      "A bank statement in PDF format, as a data URI that must include a MIME type and use Base64 encoding."
    ),
  existingTransactions: z.array(BankTransactionSchema).describe('An array of transactions already registered in the system for the period.'),
});
export type ConciliationInput = z.infer<typeof ConciliationInputSchema>;


const ConciliationOutputSchema = z.object({
  unmatchedTransactions: z.array(z.object({
    date: z.string(),
    description: z.string(),
    amount: z.number(),
    type: z.enum(['ingreso', 'egreso']),
  })).describe('Transactions found in the PDF but not in the system.'),
  exceptions: z.array(z.string()).describe('A list of discrepancies or potential issues found during conciliation.'),
});
export type ConciliationOutput = z.infer<typeof ConciliationOutputSchema>;


export async function conciliateStatement(
  input: ConciliationInput
): Promise<ConciliationOutput> {
  console.log("Attempting to conciliate statement for:", input.statementPdfUri.substring(0, 50) + '...');
  return conciliateStatementFlow(input);
}

const conciliationPrompt = ai.definePrompt({
  name: 'conciliationPrompt',
  input: { schema: ConciliationInputSchema },
  output: { schema: ConciliationOutputSchema },
  prompt: `You are an expert accounting and auditing assistant. Your task is to conciliate a bank statement (PDF) against a list of transactions already registered in the system.

  1.  Extract all transactions (date, description, amount, type) from the provided PDF.
  2.  Compare each extracted transaction with the list of 'existingTransactions'.
  3.  Identify all transactions from the PDF that do not have a corresponding match in the existing transactions. These are 'unmatchedTransactions'. A match is considered valid if the amount and date are very close (within a day).
  4.  Identify any potential discrepancies, such as transactions that exist in the system but not in the PDF, or amounts that do not match for what looks like the same transaction. List these as 'exceptions'.
  5.  Return the result in the specified format.

  Bank Statement PDF: {{media url=statementPdfUri}}
  
  Existing Transactions:
  {{#each existingTransactions}}
  - Date: {{this.date}}, Description: {{this.description}}, Amount: {{this.amount}}, Type: {{this.type}}
  {{/each}}
  `,
});

const conciliateStatementFlow = ai.defineFlow(
  {
    name: 'conciliateStatementFlow',
    inputSchema: ConciliationInputSchema,
    outputSchema: ConciliationOutputSchema,
  },
  async (input) => {
    const { output } = await conciliationPrompt(input);
    return output!;
  }
);
