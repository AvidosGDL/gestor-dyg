import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {
  onDocumentCreated,
} from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import {Resend} from 'resend';
import {defineSecret} from 'firebase-functions/params';

const RESEND_API_KEY_SM = defineSecret('RESEND_API_KEY_SM');

// The Admin UIDs and Emails
const ADMIN_UID = 'fKZUAAXTENPcUeEA4tUXFEV4xbr1';
const ADMIN_EMAILS = ['gdldanny@gmail.com', 'Roger1996.developer@gmail.com'];

// Initialize Firebase Admin SDK once
if (admin.apps.length === 0) {
    admin.initializeApp();
}

// From email
const FROM_EMAIL = 'Gestor D&G <gestor@fiscalflow.mx>';

// ================================
// FUNCIÓN REUTILIZABLE DE ENVÍO
// ================================
async function sendEmail(params: {to: string; subject: string; html: string}, apiKey: string) {
  if (!apiKey || apiKey.trim().length < 10) {
    console.error('Invalid API Key for Resend.');
    throw new HttpsError('failed-precondition', 'La configuración de envío de correos no es válida en el servidor.');
  }

  const resend = new Resend(apiKey);
  try {
    const {data, error} = await resend.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });
    if (error) {
        console.error('Resend API Error:', error);
        throw new HttpsError('internal', `Error de Resend: ${error.message}`);
    }
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
    // 1. Verificación de Autenticación
    if (!request.auth) throw new HttpsError('unauthenticated', 'Requiere iniciar sesión.');
    
    const { email, name, role, inviterId, inviterName, password, phone } = request.data as any;
    if (!email || !name || !role) throw new HttpsError('invalid-argument', 'Datos incompletos (email, nombre y rol son obligatorios).');

    let apiKey = '';
    try {
        apiKey = RESEND_API_KEY_SM.value();
    } catch (e) {
        console.error("Secret RESEND_API_KEY_SM not available");
    }

    try {
      // 2. Configurar opciones de Auth
      const authOptions: any = {
        email,
        displayName: name,
      };

      if (password && password.length >= 6) {
          authOptions.password = password;
      }

      // Sanitización de teléfono para formato E.164
      if (phone && phone.trim() !== '') {
          const digits = phone.replace(/\D/g, '');
          if (digits.length >= 10) {
              authOptions.phoneNumber = phone.startsWith('+') ? phone : `+52${digits.slice(-10)}`;
          }
      }

      // 3. Crear usuario en Firebase Auth
      const userRecord = await admin.auth().createUser(authOptions).catch(err => {
          console.error("Auth creation error:", err);
          if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Este correo ya está registrado en el sistema.');
          if (err.code === 'auth/invalid-phone-number') throw new HttpsError('invalid-argument', 'El formato del número de teléfono no es válido.');
          if (err.code === 'auth/phone-number-already-exists') throw new HttpsError('already-exists', 'Este número de teléfono ya está en uso.');
          throw new HttpsError('internal', `Error en Firebase Auth: ${err.message}`);
      });

      const uid = userRecord.uid;
      const db = admin.firestore();

      // 4. Crear perfil en Firestore
      const userProfile = {
        uid,
        name,
        email,
        role,
        phone: phone || '',
        avatarUrl: `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid}`,
        ownerIds: inviterId && inviterId !== 'none' ? [inviterId] : [],
        ownerId: inviterId && inviterId !== 'none' ? inviterId : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await db.collection('users').doc(uid).set(userProfile);

      // 5. Vincular a equipo si aplica
      if (inviterId && inviterId !== 'none') {
        await db.collection('users').doc(inviterId).collection('teamMembers').doc(uid).set({
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

      // 6. Lógica de bienvenida (Email)
      if (!password && apiKey) {
        try {
            const actionCodeSettings = { url: 'https://gestor.fiscalflow.mx/login' };
            const setupLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);

            const subject = `Bienvenido a Gestor D&G - Configura tu acceso`;
            const html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h1 style="color: #3f51b5;">Bienvenido al equipo, ${name}</h1>
                    <p>${inviterName || 'Un Administrador'} te ha dado de alta en la plataforma de Gestión Fiscal.</p>
                    <p>Para comenzar a trabajar, necesitas definir tu contraseña haciendo clic en el siguiente botón:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${setupLink}" style="padding: 12px 25px; background: #3f51b5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Definir mi Contraseña</a>
                    </div>
                    <p style="color: #666; font-size: 12px;">Tu usuario de acceso es: <strong>${email}</strong></p>
                </div>
            `;
            await sendEmail({ to: email, subject, html }, apiKey);
        } catch (linkError: any) {
            console.error("Error generating reset link:", linkError);
            return { success: true, uid, warning: 'Usuario creado, pero no se pudo enviar el correo de bienvenida automáticamente. Solicita al usuario que use la opción "Olvidé mi contraseña" en el login.' };
        }
      } else if (apiKey) {
        const subject = `Tu cuenta en Gestor D&G está lista`;
        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h1 style="color: #3f51b5;">Hola ${name}, bienvenido</h1>
                <p>Se ha creado tu acceso para la plataforma de Gestor D&G.</p>
                <p>Puedes entrar ahora mismo con las siguientes credenciales:</p>
                <p><strong>Usuario:</strong> ${email}</p>
                <p><strong>Contraseña:</strong> (La asignada por tu administrador)</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://gestor.fiscalflow.mx/login" style="padding: 12px 25px; background: #3f51b5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Acceder al Sistema</a>
                </div>
            </div>
        `;
        await sendEmail({ to: email, subject, html }, apiKey).catch(e => console.error("Welcome email failed", e));
      }

      return { success: true, uid };
    } catch (error: any) {
      console.error('Catastrophic error in registerTeamMember:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Fallo al registrar miembro: ${error.message}`);
    }
  }
);

// ================================
// ELIMINACIÓN DE USUARIO (ADMIN)
// ================================
export const deleteUserAccount = onCall(
    { region: 'us-central1' },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Requiere login.');
        
        const isAdmin = request.auth.uid === ADMIN_UID || ADMIN_EMAILS.includes(request.auth.token.email || '');
        if (!isAdmin) throw new HttpsError('permission-denied', 'Solo administradores pueden eliminar cuentas.');

        const { uid } = request.data as { uid: string };
        if (!uid) throw new HttpsError('invalid-argument', 'UID del usuario es requerido.');

        try {
            // 1. Borrar de Auth
            await admin.auth().deleteUser(uid);
            
            const db = admin.firestore();
            const batch = db.batch();

            // 2. Borrar de todas las subcolecciones teamMembers donde aparezca
            const teamMembersQuery = await db.collectionGroup('teamMembers').where('uid', '==', uid).get();
            teamMembersQuery.forEach(doc => batch.delete(doc.ref));

            // 3. Borrar perfil principal
            batch.delete(db.collection('users').doc(uid));

            await batch.commit();
            return { success: true };
        } catch (error: any) {
            console.error('Error deleting user:', error);
            throw new HttpsError('internal', `Error al intentar eliminar la cuenta del usuario: ${error.message}`);
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

    let apiKey = '';
    try {
        apiKey = RESEND_API_KEY_SM.value();
    } catch (e) {
        console.error("Secret for support notification failed");
        return;
    }

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
      await sendEmail({ to: email, subject, html }, apiKey).catch(e => console.error("Error sending support email", e));
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
    
    let apiKey = '';
    try {
        apiKey = RESEND_API_KEY_SM.value();
    } catch (e) {
        throw new HttpsError('failed-precondition', 'Configuración de correo no disponible.');
    }

    const subject = `Nueva tarea delegada: ${taskTitle.replace(/\n/g, ' ')}`;
    const html = `<h1>Se te ha delegado una nueva tarea</h1><p>Hola ${delegateName},</p><p>${delegatorName || 'Un administrador'} te ha delegado la tarea:</p><p><strong>${taskTitle}</strong></p>${taskUrl ? `<p>Detalles: <a href="${taskUrl}">${taskUrl}</a></p>` : ''}`;
    
    await sendEmail({to, subject, html}, apiKey);

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
