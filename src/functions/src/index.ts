import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';

// Helper to ensure Firebase Admin is initialized only once.
const ensureFirebaseAdminIsInitialized = () => {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
};

const RESEND_API_KEY =
  process.env.RESEND_API_KEY || '[REMOVED_RESEND_API_KEY]';
const resend = new Resend(RESEND_API_KEY);
const FROM_EMAIL = 'Gestor D&G <gestor@fiscalflow.mx>';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail({ to, subject, html }: SendEmailParams) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error(`Error de Resend al enviar a ${to}:`, error);
      throw new HttpsError(
        'internal',
        `Error al enviar correo: ${error.message}`
      );
    }
    console.log(`Correo enviado a ${to} con éxito. Resend ID: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    console.error('Excepción inesperada en sendEmail:', e);
    throw new HttpsError(
      'internal',
      'Ocurrió un error inesperado en el servidor de correo.'
    );
  }
}

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
    ensureFirebaseAdminIsInitialized();
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'La función debe ser llamada por un usuario autenticado.'
      );
    }

    const payload = request.data as TaskDelegationEmailPayload;
    if (!payload.to || !payload.taskTitle || !payload.delegateName) {
      throw new HttpsError(
        'invalid-argument',
        'Faltan datos para enviar el correo de delegación.'
      );
    }

    const { to, taskId, taskTitle, delegatorName, delegateName, taskUrl } =
      payload;
    const effectiveDelegatorName = delegatorName || 'un administrador';

    const subject = `Nueva tarea delegada: ${taskTitle}`;
    const html = `
      <h1>Se te ha delegado una nueva tarea</h1>
      <p>Hola ${delegateName},</p>
      <p>${effectiveDelegatorName} te ha delegado la tarea:</p>
      <p><strong>${taskTitle}</strong> (ID: ${taskId})</p>
      ${
        taskUrl
          ? `<p>Puedes revisar los detalles aquí: <a href="${taskUrl}">${taskUrl}</a></p>`
          : ''
      }
      <p>Por favor, revisa la tarea en el sistema.</p>
    `;

    return sendEmail({ to, subject, html });
  }
);

export const onInvitationCreatedSendEmail = onDocumentCreated(
  {
    document: 'invitations/{email}',
    region: 'us-central1',
  },
  async (event) => {
    ensureFirebaseAdminIsInitialized();
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    const data = snapshot.data();
    const email = data.email;
    const inviterName = data.inviterName || 'Un colega';
    const registrationUrl = data.registrationUrl;

    if (!email || !registrationUrl) {
      console.error(
        'Documento de invitación incompleto, falta email o URL.',
        { id: snapshot.id, data }
      );
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

const ADMIN_UID = 'fKZUAAXTENPcUeEA4tUXFEV4xbr1';

export const createImpersonationToken = onCall(
  { region: 'us-central1' },
  async (request) => {
    ensureFirebaseAdminIsInitialized();

    if (request.auth?.uid !== ADMIN_UID) {
      throw new HttpsError(
        'permission-denied',
        'Solo el administrador puede realizar esta acción.'
      );
    }

    const { email } = request.data;
    if (!email) {
      throw new HttpsError(
        'invalid-argument',
        'Se requiere el correo electrónico del usuario a suplantar.'
      );
    }

    try {
      const userToImpersonate = await admin.auth().getUserByEmail(email);
      const targetUid = userToImpersonate.uid;

      console.log(
        `[createImpersonationToken] Admin ${ADMIN_UID} is impersonating ${targetUid} (${email})`
      );

      const customToken = await admin
        .auth()
        .createCustomToken(targetUid, { impersonating: true });
      return { token: customToken };
    } catch (error: any) {
      console.error(
        `[createImpersonationToken] Failed to process impersonation for ${email}:`,
        error
      );

      if (error.code === 'auth/user-not-found') {
        throw new HttpsError(
          'not-found',
          'No se encontró ningún usuario con ese correo electrónico.'
        );
      }

      throw new HttpsError(
        'internal',
        'No se pudo completar la operación de suplantación.'
      );
    }
  }
);
