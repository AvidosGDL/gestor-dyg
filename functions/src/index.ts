import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { Resend } from "resend";
import { defineString } from 'firebase-functions/params';

// Define the Resend API key and Admin UID as configurable parameters.
const resendApiKey = defineString('RESEND_API_KEY');
const adminUid = defineString('ADMIN_UID', {default: 'fKZUAAXTENPcUeEA4tUXFEV4xbr1'});

// Initialize Firebase Admin SDK
admin.initializeApp();

// Initialize Resend with the API key from parameters
// This creates a single, reusable instance.
const resend = new Resend(resendApiKey.value());

const FROM_EMAIL = "Gestor D&G <gestor@fiscalflow.mx>";

async function sendEmail(params: { to: string; subject: string; html: string }) {
  // The Resend instance is now initialized globally and reused here.
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [params.to],
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    // Log the detailed error from Resend for better debugging
    console.error("Resend API Error:", error);
    // Throw an HttpsError with the specific message from Resend
    throw new HttpsError("internal", error.message);
  }

  return { success: true, id: data?.id };
}

export const sendEmailTask = onCall({ region: "us-central1", secrets: ["RESEND_API_KEY"] }, async (request: any) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Requiere login.");

  const data = (request.data ?? {}) as any;
  const to = data.to as string | undefined;
  const taskTitle = data.taskTitle as string | undefined;
  const delegateName = data.delegateName as string | undefined;
  const taskUrl = data.taskUrl as string | undefined;
  const delegatorName = data.delegatorName as string | undefined;

  if (!to || !taskTitle || !delegateName) {
    throw new HttpsError("invalid-argument", "Faltan datos.");
  }

  const subject = `Nueva tarea delegada: ${taskTitle}`;
  const html = `
      <h1>Se te ha delegado una nueva tarea</h1>
      <p>Hola ${delegateName},</p>
      <p>${delegatorName || 'Un administrador'} te ha delegado la tarea:</p>
      <p><strong>${taskTitle}</strong></p>
      ${
        taskUrl
          ? `<p>Puedes revisar los detalles aquí: <a href="${taskUrl}">${taskUrl}</a></p>`
          : ''
      }
      <p>Por favor, revisa la tarea en el sistema.</p>
    `;
  return sendEmail({ to, subject, html });
});

export const onInvitationCreatedSendEmail = onDocumentCreated(
  { document: "invitations/{email}", region: "us-central1", secrets: ["RESEND_API_KEY"] },
  async (event: any) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() as any;
    const email = data.email as string | undefined;
    const registrationUrl = data.registrationUrl as string | undefined;
    const inviterName = (data.inviterName as string | undefined) || "Un colega";

    if (!email || !registrationUrl) {
      console.error("Invitación incompleta", { id: snap.id, data });
      return;
    }

    const subject = `Invitación para unirte a Gestor D&G`;
    const html = `
      <h1>¡Has sido invitado!</h1>
      <p>Hola,</p>
      <p>${inviterName} te ha invitado a unirte a su equipo en Gestor D&G, una herramienta para la gestión de tareas y proyectos.</p>
      <p>Para comenzar, por favor regístrate usando este correo electrónico en el siguiente enlace:</p>
      <p><a href="${registrationUrl}" style="background-color: #3f51b5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Crear mi cuenta</a></p>
      <p>Si el botón no funciona, copia y pega esta URL en tu navegador:</p>
      <p>${registrationUrl}</p>
      <p>¡Esperamos verte pronto!</p>
      <p>El equipo de Gestor D&G</p>
    `;
    await sendEmail({ to: email, subject, html });
  }
);

export const createImpersonationToken = onCall({ region: "us-central1", secrets: ["ADMIN_UID"] }, async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado para realizar esta acción.");
  }

  const ADMIN_UID = adminUid.value();

  if (request.auth.uid !== ADMIN_UID) {
    throw new HttpsError("permission-denied", "Esta acción solo puede ser realizada por un administrador.");
  }

  const emailToImpersonate = request.data.email;
  if (!emailToImpersonate) {
    throw new HttpsError("invalid-argument", "Se requiere el correo electrónico del usuario a suplantar.");
  }

  try {
    const userToImpersonate = await admin.auth().getUserByEmail(emailToImpersonate);
    const customToken = await admin.auth().createCustomToken(userToImpersonate.uid, { impersonating: true });
    return { token: customToken };
  } catch (error: any) {
    console.error("Error al crear el token de suplantación:", error);
    if (error.code === 'auth/user-not-found') {
      throw new HttpsError("not-found", "El usuario especificado no existe.");
    }
    throw new HttpsError("internal", "Ocurrió un error inesperado al intentar suplantar al usuario.");
  }
});


export const sendTestEmail = onCall({ region: "us-central1", secrets: ["RESEND_API_KEY", "ADMIN_UID"] }, async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado para realizar esta acción.");
  }

  const ADMIN_UID = adminUid.value();
  if (request.auth.uid !== ADMIN_UID) {
    throw new HttpsError("permission-denied", "Esta acción solo puede ser realizada por un administrador.");
  }

  const { to, subject, message } = request.data;
  if (!to || !subject || !message) {
    throw new HttpsError("invalid-argument", "Se requieren destinatario, asunto y mensaje.");
  }

  const html = `<p>${message}</p><p>Este es un correo de prueba enviado desde el panel de administrador.</p>`;

  // The try-catch block now directly calls the global sendEmail function.
  // Any error thrown by sendEmail will be caught here and re-thrown with its specific message.
  try {
    return await sendEmail({ to, subject, html });
  } catch (error: any) {
    // Re-throw the error with the specific message from the Resend API
    throw new HttpsError('internal', error.message || 'Error desconocido al enviar correo.');
  }
});