import {genkit, type Genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {firebase} from '@genkit-ai/firebase';
import {firebaseFunctions} from '@genkit-ai/firebase/functions';

let aiInstance: Genkit;

function getAiInstance() {
  if (!aiInstance) {
    aiInstance = genkit({
      plugins: [
        googleAI(),
        firebase(),
        firebaseFunctions(),
      ],
      flowStateStore: 'firebase',
      traceStore: 'firebase',
      enableTracingAndMetrics: true,
      logLevel: 'debug',
    });
  }
  return aiInstance;
}

export const ai = getAiInstance();
