import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { sendTaskDelegationEmail, TaskDelegationEmailPayload } from './emails/sendTaskDelegationEmail';

admin.initializeApp();

export const sendTaskDelegationEmailCallable = onCall(
  { region: 'us-central1' },
  async (request) => {
    console.log('[sendTaskDelegationEmailCallable] Petición recibida', {
      data: request.data,
      authUid: request.auth?.uid ?? null,
    });
    
    // 1. Verify authentication
    if (!request.auth) {
        console.error('[sendTaskDelegationEmailCallable] Unauthenticated call.');
        throw new HttpsError(
          "unauthenticated",
          "The function must be called by an authenticated user."
        );
    }

    const data = request.data as Partial<TaskDelegationEmailPayload>;

    // Minimal validation
    if (!data.to || !data.taskId || !data.taskTitle || !data.delegatorName || !data.delegateName) {
      console.error('[sendTaskDelegationEmailCallable] Datos incompletos', { data });
       throw new HttpsError(
          "invalid-argument",
          "Faltan datos para enviar el correo de delegación."
        );
    }

    try {
      const result = await sendTaskDelegationEmail(data as TaskDelegationEmailPayload);

      console.log('[sendTaskDelegationEmailCallable] Envío exitoso', {
        to: data.to,
        taskId: data.taskId,
        resendId: result.id,
      });

      return {
        success: true,
        id: result.id,
      };
    } catch (err) {
      console.error('[sendTaskDelegationEmailCallable] Error al enviar el correo', {
        error:
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { value: String(err) },
      });

      throw new HttpsError(
          "internal",
          err instanceof Error ? err.message : "Error desconocido al enviar correo."
      );
    }
  }
);
