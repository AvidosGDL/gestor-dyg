import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { Resend } from "resend";
import { defineString } from 'firebase-functions/params';

// Define the Resend API key as a configurable parameter.
const resendApiKey = defineString('RESEND_API_KEY');

// The Admin UID is a constant, not a secret.
const ADMIN_UID = 'fKZUAAXTENPcUeEA4tUXFEV4xbr1';

// Initialize Firebase Admin SDK.
admin.initializeApp();

// This is the FROM email address for all emails sent from the app.
const FROM_EMAIL = "Gestor D&G <gestor@fiscalflow.mx>";

// Reusable function to send emails.
async function sendEmail(params: { to: string; subject: string; html: string }) {
  // IMPORTANT: Initialize Resend client here, inside the function body.
  // This ensures it runs at execution time, not deployment time.
  const resend = new Resend(resendApiKey.value());

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error("Resend API Error:", error);
      throw new HttpsError("internal", `Error from Resend: ${error.message}`);
    }

    return { success: true, id: data?.id };
  } catch (e: any) {
    console.error("Failed to send email:", e);
    if (e instanceof HttpsError) {
      throw e;
    }
    throw new HttpsError("internal", e.message || "Error al intentar enviar el correo.");
  }
}

// Cloud Function to send an email when a task is delegated.
export const sendEmailTask = onCall({ region: "us-central1", secrets: ["RESEND_API_KEY"] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Requiere login.");

  const { to, taskTitle, delegateName, taskUrl, delegatorName } = request.data as any;

  if (!to || !taskTitle || !delegateName) {
    throw new HttpsError("invalid-argument", "Faltan datos (to, taskTitle, delegateName).");
  }

  const subject = `Nueva tarea delegada: ${taskTitle}`;
  const html = `
      <h1>Se te ha delegado una nueva tarea</h1>
      <p>Hola ${delegateName},</p>
      <p>${delegatorName || 'Un administrador'} te ha delegado la tarea:</p>
      <p><strong>${taskTitle}</strong></p>
      ${taskUrl ? `<p>Puedes revisar los detalles aquí: <a href="${taskUrl}">${taskUrl}</a></p>`: ''}
      <p>Por favor, revisa la tarea en el sistema.</p>
    `;

  return sendEmail({ to, subject, html });
});

// Cloud Function triggered when an invitation is created.
export const onInvitationCreatedSendEmail = onDocumentCreated(
  { document: "invitations/{email}", region: "us-central1", secrets: ["RESEND_API_KEY"] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { email, registrationUrl, inviterName = "Un colega" } = snap.data() as any;

    if (!email || !registrationUrl) {
      console.error("Invitación incompleta, no se puede enviar correo.", { id: snap.id });
      return;
    }

    const subject = `Invitación para unirte a Gestor D&G`;
    const html = `
      <h1>¡Has sido invitado!</h1>
      <p>Hola,</p>
      <p>${inviterName} te ha invitado a unirte a su equipo en Gestor D&G.</p>
      <p>Para comenzar, regístrate usando este correo en el siguiente enlace:</p>
      <p><a href="${registrationUrl}" style="background-color: #3f51b5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Crear mi cuenta</a></p>
      <p>Si el botón no funciona, copia y pega esta URL: ${registrationUrl}</p>
      <p>¡Esperamos verte pronto!</p>
    `;
    
    return sendEmail({ to: email, subject, html });
  }
);

// Cloud Function to create an impersonation token for an admin.
export const createImpersonationToken = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth || request.auth.uid !== ADMIN_UID) {
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
    throw new HttpsError("internal", "Ocurrió un error al intentar suplantar al usuario.");
  }
});

// Cloud Function for admins to send a test email.
export const sendTestEmail = onCall({ region: "us-central1", secrets: ["RESEND_API_KEY"] }, async (request) => {
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError("permission-denied", "Esta acción solo puede ser realizada por un administrador.");
    }
  
    const { to, subject, message } = request.data;
  
    if (!to || !subject || !message) {
      throw new HttpsError("invalid-argument", "Se requieren destinatario, asunto y mensaje.");
    }
  
    const html = `<p>${message}</p><p>Este es un correo de prueba.</p>`;
  
    return sendEmail({ to, subject, html });
});
