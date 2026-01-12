import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { Resend } from "resend";

// ================================
// CONFIGURACIÓN DIRECTA (SIN SECRET)
// ================================
const RESEND_API_KEY = "[REMOVED_RESEND_API_KEY]";

// The Admin UID is a constant
const ADMIN_UID = "fKZUAAXTENPcUeEA4tUXFEV4xbr1";

// Initialize Firebase Admin SDK
admin.initializeApp();

// From email
const FROM_EMAIL = "Gestor D&G <gestor@fiscalflow.mx>";

// ================================
// FUNCIÓN REUTILIZABLE DE ENVÍO
// ================================
async function sendEmail(params: { to: string; subject: string; html: string }) {
  if (!RESEND_API_KEY || RESEND_API_KEY.trim().length < 10) {
    console.error("RESEND_API_KEY inválida o ausente");
    throw new HttpsError(
      "failed-precondition",
      "La API Key de Resend no está configurada correctamente."
    );
  }

  const resend = new Resend(RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error("Resend error:", error);
      throw new HttpsError("internal", error.message);
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("Error enviando correo:", err);
    throw new HttpsError("internal", err.message || "Error enviando correo");
  }
}

// ================================
// FUNCIÓN: TAREA DELEGADA
// ================================
export const sendEmailTask = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Requiere login.");
  }

  const { to, taskTitle, delegateName, taskUrl, delegatorName } = request.data;

  if (!to || !taskTitle || !delegateName) {
    throw new HttpsError("invalid-argument", "Datos incompletos.");
  }

  const subject = `Nueva tarea delegada: ${taskTitle}`;
  const html = `
    <h1>Nueva tarea</h1>
    <p>Hola ${delegateName},</p>
    <p>${delegatorName || "Un administrador"} te asignó la tarea:</p>
    <strong>${taskTitle}</strong>
    ${taskUrl ? `<p><a href="${taskUrl}">Ver tarea</a></p>` : ""}
  `;

  return sendEmail({ to, subject, html });
});

// ================================
// FUNCIÓN: INVITACIÓN
// ================================
export const onInvitationCreatedSendEmail = onDocumentCreated(
  { document: "invitations/{email}", region: "us-central1" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { email, registrationUrl, inviterName = "Un colega" } = snap.data();

    if (!email || !registrationUrl) return;

    const subject = "Invitación a Gestor D&G";
    const html = `
      <h1>Has sido invitado</h1>
      <p>${inviterName} te invitó a Gestor D&G</p>
      <a href="${registrationUrl}">Crear cuenta</a>
    `;

    return sendEmail({ to: email, subject, html });
  }
);

// ================================
// FUNCIÓN: SUPLANTACIÓN
// ================================
export const createImpersonationToken = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError("permission-denied", "Solo admin.");
    }

    const email = request.data.email;
    if (!email) {
      throw new HttpsError("invalid-argument", "Email requerido.");
    }

    const user = await admin.auth().getUserByEmail(email);
    const token = await admin.auth().createCustomToken(user.uid, {
      impersonating: true,
    });

    return { token };
  }
);

// ================================
// FUNCIÓN: EMAIL DE PRUEBA
// ================================
export const sendTestEmail = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError("permission-denied", "Solo admin.");
    }

    const { to, subject, message } = request.data;

    if (!to || !subject || !message) {
      throw new HttpsError("invalid-argument", "Datos incompletos.");
    }

    const html = `<p>${message}</p><p>Email de prueba</p>`;
    return sendEmail({ to, subject, html });
  }
);
