import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Resend } from 'resend';

admin.initializeApp();

interface TaskDelegationEmailPayload {
  to: string;
  taskId: string;
  taskTitle: string;
  delegatorName: string;
  delegateName: string;
  taskUrl?: string;
}

export const sendEmailTask = onCall(
  { region: 'us-central1' },
  async (request) => {
    const resend = new Resend('[REMOVED_RESEND_API_KEY]');
    console.log('[sendEmailTask] Petición recibida', {
      data: request.data,
      authUid: request.auth?.uid ?? null,
    });
    
    if (!request.auth) {
        console.error('[sendEmailTask] Unauthenticated call.');
        throw new HttpsError(
          "unauthenticated",
          "The function must be called by an authenticated user."
        );
    }

    const data = request.data as TaskDelegationEmailPayload;

    if (!data.to || !data.taskId || !data.taskTitle || !data.delegatorName || !data.delegateName) {
      console.error('[sendEmailTask] Datos incompletos', { data });
       throw new HttpsError(
          "invalid-argument",
          "Faltan datos para enviar el correo de delegación."
        );
    }

    try {
      const { to, taskId, taskTitle, delegatorName, delegateName, taskUrl } = data;

      console.log('[sendEmailTask] Preparing to send email', { to, taskId, taskTitle });

      const { data: resendData, error } = await resend.emails.send({
        from: 'Gestor D&G <gestor@fiscalflow.mx>',
        to: [to],
        subject: `Nueva tarea delegada: ${taskTitle}`,
        html: `
          <h1>Se te ha delegado una nueva tarea</h1>
          <p>Hola ${delegateName},</p>
          <p>${delegatorName} te ha delegado la tarea:</p>
          <p><strong>${taskTitle}</strong> (ID: ${taskId})</p>
          ${taskUrl ? `<p>Puedes revisar los detalles aquí: <a href="${taskUrl}">${taskUrl}</a></p>` : ''}
          <p>Por favor, revisa la tarea en el sistema.</p>
        `,
      });

      if (error) {
        console.error('[sendEmailTask] Error returned by Resend', { to, taskId, error });
        throw new HttpsError("internal", `Error sending email with Resend: ${error.message ?? 'no message'}`);
      }

      console.log('[sendEmailTask] Email sent successfully', { to, taskId, resendId: resendData?.id });
      return { success: true, id: resendData?.id };

    } catch (err) {
      console.error('[sendEmailTask] Exception while sending email', {
        error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: String(err) },
      });

      if (err instanceof HttpsError) {
        throw err;
      }
      
      throw new HttpsError(
          "internal",
          err instanceof Error ? err.message : "Error desconocido al enviar correo."
      );
    }
  }
);

    