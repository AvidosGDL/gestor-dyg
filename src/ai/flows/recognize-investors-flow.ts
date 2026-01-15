'use server';
/**
 * @fileOverview A Genkit flow for recognizing investor data from an image of a spreadsheet.
 *
 * This file defines:
 * - recognizeInvestorsFromImage: An async function that takes an image data URI and returns a list of investors.
 * - RecognizeInvestorsInput: The Zod schema for the flow's input.
 * - RecognizeInvestorsOutput: The Zod schema for the flow's output.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const RecognizeInvestorsInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "A photo of a spreadsheet with investor data, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type RecognizeInvestorsInput = z.infer<typeof RecognizeInvestorsInputSchema>;

const InvestorSchema = z.object({
    name: z.string().describe("Full name of the investor. From the 'NOMBRE DEL INVERSIONISTA' column."),
    investmentDate: z.string().describe("Date of the initial investment. From the 'FECHA DE PAGO' column. Format as YYYY-MM-DD."),
    investmentAmount: z.number().describe("Total amount of the investment. From the 'INVERSION' column."),
    interestRate: z.number().describe("Agreed interest rate in percentage. From the 'INTERES MENSUAL' column."),
    paymentMethod: z.string().describe("Method of payment. Use 'Transferencia' as default unless specified otherwise in comments.").optional(),
    status: z.enum(["Activa", "Liquidada"]).describe("Current status of the investment. Default to 'Activa'."),
});


const RecognizeInvestorsOutputSchema = z.object({
  investors: z
    .array(InvestorSchema)
    .describe('An array of investor data recognized from the image.'),
});
export type RecognizeInvestorsOutput = z.infer<typeof RecognizeInvestorsOutputSchema>;

export async function recognizeInvestorsFromImage(
  input: RecognizeInvestorsInput
): Promise<RecognizeInvestorsOutput> {
  return recognizeInvestorsFlow(input);
}

const recognizeInvestorsPrompt = ai.definePrompt({
  name: 'recognizeInvestorsPrompt',
  input: { schema: RecognizeInvestorsInputSchema },
  output: { schema: RecognizeInvestorsOutputSchema },
  prompt: `You are an expert accounting assistant. Analyze the provided image of a spreadsheet and extract a list of distinct investors.
  
  The spreadsheet contains the following columns: "NOMBRE DEL INVERSIONISTA", "PLAZO", "INTERES MENSUAL", "INVERSION", "PAGO DE INTERES", "FECHA DE PAGO" and "COMENTARIO".
  
  For each row, extract the data and map it to the following fields:
  - name: Use the value from "NOMBRE DEL INVERSIONISTA".
  - investmentDate: Use the value from "FECHA DE PAGO" and format it as YYYY-MM-DD.
  - investmentAmount: Use the numerical value from "INVERSION".
  - interestRate: Use the numerical percentage from "INTERES MENSUAL".
  - paymentMethod: Default to 'Transferencia' if not specified.
  - status: Default to 'Activa'.

Image: {{media url=imageDataUri}}`,
});

const recognizeInvestorsFlow = ai.defineFlow(
  {
    name: 'recognizeInvestorsFlow',
    inputSchema: RecognizeInvestorsInputSchema,
    outputSchema: RecognizeInvestorsOutputSchema,
  },
  async (input) => {
    const { output } = await recognizeInvestorsPrompt(input);
    return output!;
  }
);
