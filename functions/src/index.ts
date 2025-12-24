import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { Resend } from "resend";

const ensureAdmin = () => {
  if (admin.apps.length === 0) admin.initializeApp();
};

// --- Resend (NO hardcode) ---
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "Gestor D&G <gestor@fiscalflow.mx>";

function getResend() {
  if (!RESEND_API_KEY) {
     console.warn("RESEND_API_KEY no está configurada. El envío de correos fallará.");
     // Return a mock or throw an error, but don't use a hardcoded key.
     // For this implementation, we will let it fail downstream.
     return new Resend("[REMOVED_RESEND_API_KEY]");
  }
  return new Resend(RESEND_API_KEY);
}

async function sendEmail(params: { to: string; subject: string; html: string }) {
  if (!RESEND_API_KEY) {
      console.error("No se puede enviar el correo porque RESEND_API_KEY no está configurada.");
      // Throw a specific error for the caller to handle if needed
      throw new HttpsError("failed-precondition", "La configuración del servidor de correo está incompleta.");
  }
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [params.to],
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    console.error("Resend error:", error);
    throw new HttpsError("internal", `Error al enviar correo: ${error.message}`);
  }

  return { success: true, id: data?.id };
}

// 1) Callable: enviar correo delegación
export const sendEmailTask = onCall({ region: "us-central1" }, async (request) => {
  ensureAdmin();
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

// 2) Trigger: invitación creada
export const onInvitationCreatedSendEmail = onDocumentCreated(
  { document: "invitations/{email}", region: "us-central1" },
  async (event) => {
    ensureAdmin();
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

// 3) Callable: suplantación
export const createImpersonationToken = onCall({ region: "us-central1" }, async (request) => {
  ensureAdmin();

  if (!request.auth) {
      throw new HttpsError("unauthenticated", "La operación requiere autenticación.");
  }

  // Se recomienda usar custom claims en el token del admin para verificar permisos.
  // Por ahora, se usa una variable de entorno para el UID del admin.
  const ADMIN_UID = process.env.ADMIN_UID;
  if (!ADMIN_UID) {
      console.error("La variable de entorno ADMIN_UID no está configurada.");
      throw new HttpsError("failed-precondition", "El sistema no está configurado para la suplantación.");
  }

  if (request.auth.uid !== ADMIN_UID) {
    throw new HttpsError("permission-denied", "Esta acción está restringida solo para administradores.");
  }

  const data = (request.data ?? {}) as { email?: string };
  const email = data.email;
  if (!email) {
      throw new HttpsError("invalid-argument", "Se requiere el correo electrónico del usuario a suplantar.");
  }

  try {
    const userToImpersonate = await admin.auth().getUserByEmail(email);
    const customToken = await admin.auth().createCustomToken(userToImpersonate.uid, { impersonating: true });
    return { token: customToken };
  } catch (error: any) {
    console.error("Fallo en la suplantación:", error?.stack || error);
    if (error?.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "No se encontró ningún usuario con ese correo electrónico.");
    }
    throw new HttpsError("internal", "No se pudo completar la operación de suplantación.");
  }
});
