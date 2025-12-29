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
     return { emails: { send: () => Promise.resolve({ data: null, error: { message: "RESEND_API_KEY is not configured.", name: "missing_api_key" } }) } } as any;
  }
  return new Resend(RESEND_API_KEY);
}

async function sendEmail(params: { to: string; subject: string; html: string }) {
  if (!RESEND_API_KEY) {
      console.error("No se puede enviar el correo porque RESEND_API_KEY no está configurada.");
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

export const createImpersonationToken = onCall({ region: "us-central1" }, async (request) => {
  // Versión mínima para prueba de despliegue.
  console.log("createImpersonationToken fue llamada (versión de prueba)");
  return { status: "Función de prueba desplegada correctamente." };
});
