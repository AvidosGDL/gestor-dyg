import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {
  onDocumentCreated,
  onDocumentUpdated,
} from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import {Resend} from 'resend';
import {defineSecret} from 'firebase-functions/params';

const RESEND_API_KEY_SM = defineSecret('RESEND_API_KEY_SM');

// The Admin UIDs and Emails
const ADMIN_UID = 'fKZUAAXTENPcUeEA4tUXFEV4xbr1';
const ADMIN_EMAILS = ['gdldanny@gmail.com', 'Roger1996.developer@gmail.com'];

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
    admin.initializeApp();
}

// From email
const FROM_EMAIL = 'Gestor D&G <gestor@fiscalflow.mx>';

// ================================
// FUNCIÓN REUTILIZABLE DE ENVÍO
// ================================
async function sendEmail(params: {to: string; subject: string; html: string}) {
  const key = RESEND_API_KEY_SM.value();

  if (!key || key.trim().length < 10) {
    console.error('Missing or invalid RESEND_API_KEY_SM secret at runtime.');
    throw new HttpsError('failed-precondition', 'El secreto de la API no está configurado.');
  }

  const resend = new Resend(key);
  try {
    const {data, error} = await resend.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });
    if (error) throw new HttpsError('internal', `Error from Resend: ${error.message}`);
    return {success: true, id: data?.id};
  } catch (err: any) {
    console.error('Error enviando correo:', err);
    throw new HttpsError('internal', err.message || 'Error enviando correo');
  }
}

// ================================
// WHATSAPP HELPERS
// ================================
function normalizeToWhatsAppJid(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('521') && digits.length === 13) return `${digits}@s.whatsapp.net`;
  if (digits.startsWith('52') && digits.length === 12) return `521${digits.slice(2)}@s.whatsapp.net`;
  if (digits.length === 10) return `521${digits}@s.whatsapp.net`;
  return null;
}

async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const url = 'https://baileys-worker-dev-24342745173.us-central1.run.app/v1/channels/yE1vsdQcwWGuxvNoFIFr/messages/send';
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text }),
    });
  } catch (error) {
    console.error('[WA] error sending message', error);
  }
}

// ================================
// REGISTRO DE MIEMBRO POR ADMIN
// ================================
export const registerTeamMember = onCall(
  { region: 'us-central1', secrets: [RESEND_API_KEY_SM] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Requiere login.');
    
    const { email, name, role, inviterId, inviterName, password, phone } = request.data as any;
    if (!email || !name || !role) throw new HttpsError('invalid-argument', 'Datos incompletos.');

    try {
      // 1. Crear usuario en Firebase Auth
      const userRecord = await admin.auth().createUser({
        email,
        displayName: name,
        ...(password && { password }),
        ...(phone && { phoneNumber: phone.startsWith('+') ? phone : `+52${phone}` })
      }).catch(err => {
          if (err.code === 'auth/email-already-exists') {
              throw new HttpsError('already-exists', 'Este correo ya está registrado en el sistema.');
          }
          throw err;
      });

      const uid = userRecord.uid;

      // 2. Crear perfil en Firestore
      const userProfile = {
        uid,
        name,
        email,
        role,
        phone: phone || '',
        avatarUrl: `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid}`,
        ownerIds: inviterId ? [inviterId] : [],
        ownerId: inviterId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await admin.firestore().collection('users').doc(uid).set(userProfile);

      // 3. Agregar a la subcolección teamMembers del invitador si existe
      if (inviterId) {
        await admin.firestore().collection('users').doc(inviterId).collection('teamMembers').doc(uid).set({
          id: uid,
          uid: uid,
          name,
          email,
          role,
          avatarUrl: userProfile.avatarUrl,
          phone: phone || '',
          authType: 'email'
        });
      }

      // 4. Lógica de acceso (Link vs Contraseña asignada)
      if (!password) {
        const actionCodeSettings = { url: 'https://gestor.fiscalflow.mx/login' };
        const setupLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);

        const subject = `Bienvenido a Gestor D&G - Configura tu acceso`;
        const html = `
            <h1>Bienvenido al equipo, ${name}</h1>
            <p>${inviterName} te ha dado de alta en la plataforma.</p>
            <p>Para comenzar a trabajar, necesitas definir tu contraseña haciendo clic en el siguiente enlace:</p>
            <p><a href="${setupLink}" style="padding: 10px 20px; background: #3f51b5; color: white; text-decoration: none; border-radius: 5px;">Definir mi Contraseña</a></p>
            <br/>
            <p>Una vez definida, podrás entrar con tu correo: <strong>${email}</strong></p>
        `;
        await sendEmail({ to: email, subject, html });
      } else {
        const subject = `Bienvenido a Gestor D&G - Tu cuenta está lista`;
        const html = `
            <h1>Hola ${name}, bienvenido al equipo</h1>
            <p>${inviterName} ha creado tu acceso para Gestor D&G.</p>
            <p>Puedes entrar ahora mismo con las siguientes credenciales:</p>
            <p><strong>Usuario:</strong> ${email}</p>
            <p><strong>Contraseña:</strong> (La asignada por tu administrador)</p>
            <br/>
            <p><a href="https://gestor.fiscalflow.mx/login" style="padding: 10px 20px; background: #3f51b5; color: white; text-decoration: none; border-radius: 5px;">Acceder al Sistema</a></p>
        `;
        await sendEmail({ to: email, subject, html });
      }

      return { success: true, uid };
    } catch (error: any) {
      console.error('Error registering team member:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message || 'Error al registrar miembro.');
    }
  }
);

// ================================
// ELIMINACIÓN DE USUARIO (ADMIN)
// ================================
export const deleteUserAccount = onCall(
    { region: 'us-central1' },
    async (request) => {
        if (!request.auth || (request.auth.uid !== ADMIN_UID && !ADMIN_EMAILS.includes(request.auth.token.email || ''))) {
            throw new HttpsError('permission-denied', 'Solo el administrador principal puede realizar esta acción.');
        }

        const { uid } = request.data as { uid: string };
        if (!uid) throw new HttpsError('invalid-argument', 'UID requerido.');

        try {
            await admin.auth().deleteUser(uid);
            const db = admin.firestore();
            const teamMembersQuery = await db.collectionGroup('teamMembers').where('uid', '==', uid).get();
            const batch = db.batch();
            teamMembersQuery.forEach(doc => batch.delete(doc.ref));
            batch.delete(db.collection('users').doc(uid));
            await batch.commit();
            return { success: true };
        } catch (error: any) {
            console.error('Error deleting user:', error);
            throw new HttpsError('internal', error.message || 'Error al eliminar usuario.');
        }
    }
);

// ================================
// NOTIFICACIÓN TICKET SOPORTE
// ================================
export const onSupportTicketCreated = onDocumentCreated(
  { document: 'supportTickets/{ticketId}', region: 'us-central1', secrets: [RESEND_API_KEY_SM] },
  async event => {
    const snap = event.data;
    if (!snap) return;
    const ticket = snap.data();
    if (!ticket) return;

    const { type, description, severity, creatorName, creatorEmail } = ticket;
    const subject = `[NUEVO TICKET] ${type === 'bug' ? 'BUG' : 'MEJORA'} - Prioridad ${severity}`;
    const html = `
      <h1>Nuevo Reporte de Sistema</h1>
      <p><strong>Reportado por:</strong> ${creatorName} (${creatorEmail})</p>
      <p><strong>Tipo:</strong> ${type}</p>
      <p><strong>Severidad:</strong> ${severity}</p>
      <p><strong>Descripción:</strong> ${description}</p>
    `;

    for (const email of ADMIN_EMAILS) {
      await sendEmail({ to: email, subject, html }).catch(e => console.error("Error sending support email to admin", e));
    }
  }
);

// ================================
// FUNCIÓN: TAREA DELEGADA
// ================================
export const sendEmailTask = onCall(
  {region: 'us-central1', secrets: [RESEND_API_KEY_SM]},
  async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Requiere login.');
    const {to, taskTitle, delegateName, taskUrl, delegatorName, delegateId} = request.data as any;
    
    const subject = `Nueva tarea delegada: ${taskTitle.replace(/\n/g, ' ')}`;
    const html = `<h1>Se te ha delegado una nueva tarea</h1><p>Hola ${delegateName},</p><p>${delegatorName || 'Un administrador'} te ha delegado la tarea:</p><p><strong>${taskTitle}</strong></p>${taskUrl ? `<p>Detalles: <a href="${taskUrl}">${taskUrl}</a></p>` : ''}`;
    
    await sendEmail({to, subject, html});

    try {
      let phone: string | null = null;
      if (delegateId) {
        const userDoc = await admin.firestore().collection('users').doc(delegateId).get();
        if (userDoc.exists) phone = userDoc.data()?.phone || null;
      }
      const jid = normalizeToWhatsAppJid(phone);
      if (jid) {
        const whatsAppText = `*Se te ha delegado una nueva tarea*\n\nHola ${delegateName},\n\n${delegatorName || 'Un administrador'} te ha delegado la tarea:\n*${taskTitle}*\n\n${taskUrl ? `Detalles: ${taskUrl}` : ''}`;
        await sendWhatsAppMessage(jid, whatsAppText);
      }
    } catch (waError) {}
    
    return { success: true };
  }
);