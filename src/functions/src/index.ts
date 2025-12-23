import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import {Resend} from 'resend';

try {
  admin.initializeApp();
} catch (e) {
  console.log('Admin already initialized');
}

// --- Configuración Centralizada de Resend ---
const RESEND_API_KEY =
  process.env.RESEND_API_KEY || '[REMOVED_RESEND_API_KEY]';
const resend = new Resend(RESEND_API_KEY);
const FROM_EMAIL = 'Gestor D&G <gestor@fiscalflow.mx>';

// --- Interfaz para la Función Genérica de Correo ---
interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Función genérica y reutilizable para enviar correos electrónicos usando Resend.
 * Esta función no es una Cloud Function, sino una utilidad interna.
 */
async function sendEmail({to, subject, html}: SendEmailParams) {
  const {data, error} = await resend.emails.send({
    from: FROM_EMAIL,
    to: [to], // El destinatario siempre debe ser un array
    subject,
    html,
  });

  if (error) {
    // Si hay un error, lo lanzamos para que la función que la llamó lo capture.
    console.error(`Error de Resend al enviar a ${to}:`, error);
    throw new HttpsError(
      'internal',
      `Error al enviar correo con Resend: ${error.message ?? 'no message'}`
    );
  }

  console.log(`Correo enviado a ${to} con éxito. Resend ID: ${data?.id}`);
  return {success: true, id: data?.id};
}

// --- Cloud Functions que utilizan la utilidad de correo ---

interface TaskDelegationEmailPayload {
  to: string;
  taskId: string;
  taskTitle: string;
  delegatorName: string | null;
  delegateName: string;
  taskUrl?: string;
}

/**
 * Cloud Function (onCall) para notificar sobre la delegación de una tarea.
 */
export const sendEmailTask = onCall(
  {region: 'us-central1'},
  async (request) => {
    console.log('[sendEmailTask] Petición recibida', {
      data: request.data,
      authUid: request.auth?.uid ?? null,
    });

    if (!request.auth) {
      console.error('[sendEmailTask] Llamada no autenticada.');
      throw new HttpsError(
        'unauthenticated',
        'La función debe ser llamada por un usuario autenticado.'
      );
    }

    const payload = request.data as TaskDelegationEmailPayload;

    if (!payload.to || !payload.taskTitle || !payload.delegateName) {
      console.error('[sendEmailTask] Datos incompletos', {payload});
      throw new HttpsError(
        'invalid-argument',
        'Faltan datos para enviar el correo de delegación.'
      );
    }

    const {to, taskId, taskTitle, delegatorName, delegateName, taskUrl} =
      payload;
    const effectiveDelegatorName = delegatorName || 'un administrador';

    // 1. Construir el asunto y el HTML específicos
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

    try {
      // 2. Llamar a la función genérica de envío
      return await sendEmail({to, subject, html});
    } catch (error) {
      console.error(
        '[sendEmailTask] Excepción al enviar correo de delegación:',
        error
      );
      // Re-lanzar el error para que el cliente lo reciba
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Error desconocido.'
      );
    }
  }
);

/**
 * Cloud Function (Trigger) para enviar un correo de invitación cuando se crea
 * un nuevo documento en la colección 'invitations'.
 */
export const onInvitationCreatedSendEmail = onDocumentCreated(
  {
    document: 'invitations/{email}',
    region: 'us-central1',
  },
  async (event) => {
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
        {id: snapshot.id, data}
      );
      return;
    }

    console.log(
      `[onInvitationCreatedSendEmail] Nueva invitación para ${email}.`
    );

    // 1. Construir el asunto y el HTML específicos
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

    try {
      // 2. Llamar a la función genérica de envío
      await sendEmail({to: email, subject, html});
    } catch (error) {
      console.error(
        `[onInvitationCreatedSendEmail] Falló el envío de invitación a ${email}:`,
        error
      );
    }
  }
);


const ADMIN_UID = 'fKZUAAXTENPcUeEA4tUXFEV4xbr1';

/**
 * Cloud Function para crear un token de suplantación.
 * Solo puede ser llamada por el administrador.
 */
export const createImpersonationToken = onCall(
  { region: 'us-central1' },
  async (request) => {
    // 1. Verificar que el que llama es el administrador
    if (request.auth?.uid !== ADMIN_UID) {
      console.error(`[createImpersonationToken] Intento de llamada no autorizado por UID: ${request.auth?.uid}`);
      throw new HttpsError(
        'permission-denied',
        'Solo el administrador puede realizar esta acción.'
      );
    }

    const { email } = request.data;
    if (!email) {
      throw new HttpsError('invalid-argument', 'Se requiere el correo electrónico del usuario a suplantar.');
    }
    
    let userToImpersonate;
    try {
        userToImpersonate = await admin.auth().getUserByEmail(email);
    } catch (error: any) {
        console.error(`[createImpersonationToken] Error al buscar usuario por email ${email}:`, error);
        if (error.code === 'auth/user-not-found') {
            throw new HttpsError('not-found', 'No se encontró ningún usuario con ese correo electrónico.');
        }
        throw new HttpsError('internal', 'Ocurrió un error al buscar al usuario.');
    }

    const targetUid = userToImpersonate.uid;
    console.log(`[createImpersonationToken] Administrador ${ADMIN_UID} suplantará a ${targetUid} (${email})`);

    try {
        const customToken = await admin.auth().createCustomToken(targetUid, { impersonating: true });
        return { token: customToken };
    } catch (error: any) {
        console.error(`[createImpersonationToken] Error al crear el token personalizado para ${targetUid}:`, error);
        throw new HttpsError('internal', 'No se pudo generar el token de suplantación.');
    }
  }
);
