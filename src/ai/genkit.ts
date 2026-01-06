import 'server-only';
import {genkit, type Genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {firebase} from '@genkit-ai/firebase';

let aiInstance: Genkit | null = null;

function initializeAi() {
  if (!aiInstance) {
    aiInstance = genkit({
      plugins: [
        googleAI(),
        firebase(),
      ],
      flowStateStore: 'firebase',
      traceStore: 'firebase',
      enableTracingAndMetrics: true,
      logLevel: 'debug',
    });
  }
  return aiInstance;
}

export const ai = initializeAi();
