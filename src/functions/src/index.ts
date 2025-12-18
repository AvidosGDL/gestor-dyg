
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { Resend } from 'resend';

admin.initializeApp();

// Clave de API de Resend. Asegúrate de que esta es la clave correcta.
// Se recomienda manejar esto a través de variables de entorno de Firebase en un futuro.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '[REMOVED_RESEND_API_KEY]';
const resend = new Resend(RESEND_API_KEY);


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


export const onInvitationCreatedSendEmail = onDocumentCreated(
  {
    document: "invitations/{email}",
    region: 'us-central1'
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log("No data associated with the event");
      return;
    }

    const data = snapshot.data();
    const email = data.email;
    const inviterName = data.inviterName || 'Un colega';
    const registrationUrl = data.registrationUrl;

    if (!email || !registrationUrl) {
      console.error('Documento de invitación incompleto, falta email o URL.', { id: snapshot.id, data });
      return;
    }

    console.log(`[onInvitationCreatedSendEmail] Nueva invitación detectada para ${email}. Enviando correo.`);

    try {
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
        console.error(`[onInvitationCreatedSendEmail] Error de Resend para ${email}:`, error);
        return;
      }

      console.log(`[onInvitationCreatedSendEmail] Correo de invitación enviado a ${email}. Resend ID: ${resendData?.id}`);

    } catch (err) {
      console.error('[onInvitationCreatedSendEmail] Excepción al enviar correo:', {
        email: email,
        error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: String(err) },
      });
    }
  }
);
