
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Resend } from 'resend';

admin.initializeApp();
const resend = new Resend('[REMOVED_RESEND_API_KEY]');


interface TaskDelegationEmailPayload {
  to: string;
  taskId: string;
  taskTitle: string;
  delegatorName: string | null;
  delegateName: string;
  taskUrl?: string;
}

export const sendEmailTask = onCall(
  { region: 'us-central1' },
  async (request) => {
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

    if (!data.to || !data.taskId || !data.taskTitle || !data.delegateName) {
      console.error('[sendEmailTask] Datos incompletos', { data });
       throw new HttpsError(
          "invalid-argument",
          "Faltan datos para enviar el correo de delegación."
        );
    }

    try {
      const { to, taskId, taskTitle, delegatorName, delegateName, taskUrl } = data;
      const effectiveDelegatorName = delegatorName || 'un administrador';

      console.log('[sendEmailTask] Preparing to send email', { to, taskId, taskTitle });

      const { data: resendData, error } = await resend.emails.send({
        from: 'Gestor D&G <gestor@fiscalflow.mx>',
        to: [to],
        subject: `Nueva tarea delegada: ${taskTitle}`,
        html: `
          <h1>Se te ha delegado una nueva tarea</h1>
          <p>Hola ${delegateName},</p>
          <p>${effectiveDelegatorName} te ha delegado la tarea:</p>
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

interface InvitationEmailPayload {
  email: string;
  inviterName: string;
  registrationUrl: string; // Add this line
}

export const sendInvitationEmail = onCall(
  { region: 'us-central1' },
  async (request) => {
    console.log('[sendInvitationEmail] Petición recibida', {
      data: request.data,
      authUid: request.auth?.uid ?? null,
    });
    
    if (!request.auth) {
      console.error('[sendInvitationEmail] Unauthenticated call.');
      throw new HttpsError(
        "unauthenticated",
        "Debes estar autenticado para enviar invitaciones."
      );
    }

    const data = request.data as InvitationEmailPayload;

    if (!data.email || !data.inviterName || !data.registrationUrl) {
      console.error('[sendInvitationEmail] Datos incompletos', { data });
       throw new HttpsError(
          "invalid-argument",
          "Faltan el email, el nombre del remitente o la URL de registro."
        );
    }

    try {
      const { email, inviterName, registrationUrl } = data;

      const { data: resendData, error } = await resend.emails.send({
        from: 'Gestor D&G <gestor@fiscalflow.mx>',
        to: [email],
        subject: `Invitación para unirte a Gestor D&G`,
        html: `
          <h1>¡Has sido invitado!</h1>
          <p>Hola,</p>
          <p>${inviterName} te ha invitado a unirte a su equipo en Gestor D&G, una herramienta para la gestión de tareas y proyectos.</p>
          <p>Para comenzar, por favor regístrate usando este correo electrónico en el siguiente enlace:</p>
          <p><a href="${registrationUrl}" style="background-color: #3f51b5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Crear mi cuenta</a></p>
          <p>Si el botón no funciona, copia y pega esta URL en tu navegador:</p>
          <p>${registrationUrl}</p>
          <p>¡Esperamos verte pronto!</p>
          <p>El equipo de Gestor D&G</p>
        `,
      });

      if (error) {
        console.error('[sendInvitationEmail] Error returned by Resend', { email, error });
        throw new HttpsError("internal", `Error sending email with Resend: ${error.message ?? 'no message'}`);
      }

      console.log('[sendInvitationEmail] Email sent successfully', { email, resendId: resendData?.id });
      return { success: true, id: resendData?.id };

    } catch (err) {
      console.error('[sendInvitationEmail] Exception while sending email', {
        error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: String(err) },
      });

      if (err instanceof HttpsError) {
        throw err;
      }
      
      throw new HttpsError(
          "internal",
          err instanceof Error ? err.message : "Error desconocido al enviar correo de invitación."
      );
    }
  }
);
