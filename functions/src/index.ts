'use client';

import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {
  onDocumentCreated,
} from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import {Resend} from 'resend';
import {defineSecret} from 'firebase-functions/params';

const RESEND_API_KEY_SM = defineSecret('RESEND_API_KEY_SM');

// The Admin UID is a constant
const ADMIN_UID = 'fKZUAAXTENPcUeEA4tUXFEV4xbr1';

// Initialize Firebase Admin SDK
admin.initializeApp();

// From email
const FROM_EMAIL = 'Gestor D&G <gestor@fiscalflow.mx>';

// ================================
// FUNCIÓN REUTILIZABLE DE ENVÍO
// ================================
async function sendEmail(params: {to: string; subject: string; html: string}) {
  const key = RESEND_API_KEY_SM.value();

  // Preflight check to ensure the key is loaded
  if (!key || key.trim().length < 10) {
    console.error(
      'Missing or invalid RESEND_API_KEY_SM secret at runtime. Length:',
      key?.length ?? 0
    );
    throw new HttpsError(
      'failed-precondition',
      'El secreto de la API para enviar correos (RESEND_API_KEY_SM) no está configurado correctamente en el servidor.'
    );
  }

  const resend = new Resend(key);

  try {
    const {data, error} = await resend.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error('Resend API Error:', error);
      throw new HttpsError('internal', `Error from Resend: ${error.message}`);
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
  
  if (digits.startsWith('521') && digits.length === 13) {
    return `${digits}@s.whatsapp.net`;
  }
  
  if (digits.startsWith('52') && digits.length === 12) {
    return `521${digits.slice(2)}@s.whatsapp.net`;
  }
  
  if (digits.length === 10) {
    return `521${digits}@s.whatsapp.net`;
  }
  
  return null;
}

async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const url = 'https://baileys-worker-701554958520.us-central1.run.app/v1/channels/PRUEBAS-GENERALES/messages/send';
  try {
    console.log('[WA] sending to', to);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text }),
    });
    
    if (!response.ok) {
      const body = await response.text();
      console.error('[WA] failed', { status: response.status, body });
    } else {
      console.log('[WA] success');
    }
  } catch (error) {
    console.error('[WA] error sending message', error);
  }
}

// ================================
// FUNCIÓN: TAREA DELEGADA
// ================================
export const sendEmailTask = onCall(
  {region: 'us-central1', secrets: [RESEND_API_KEY_SM]},
  async request => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Requiere login.');
    }

    const {to, taskTitle, delegateName, taskUrl, delegatorName, delegateId} =
      request.data as any;

    if (!to || !taskTitle || !delegateName) {
      throw new HttpsError(
        'invalid-argument',
        'Datos incompletos (to, taskTitle, delegateName).'
      );
    }

    const subject = `Nueva tarea delegada: ${taskTitle.replace(/\n/g, ' ')}`;
    const html = `
    <h1>Se te ha delegado una nueva tarea</h1>
    <p>Hola ${delegateName},</p>
    <p>${delegatorName || 'Un administrador'} te ha delegado la tarea:</p>
    <p><strong>${taskTitle}</strong></p>
    ${taskUrl ? `<p>Detalles: <a href="${taskUrl}">${taskUrl}</a></p>` : ''}
  `;

    const emailResult = await sendEmail({to, subject, html});

    // WhatsApp Integration
    try {
      let phone: string | null = null;
      if (delegateId) {
        const userDoc = await admin.firestore().collection('users').doc(delegateId).get();
        if (userDoc.exists) {
          phone = userDoc.data()?.phone || null;
        }
      }

      const jid = normalizeToWhatsAppJid(phone);
      if (jid) {
        const whatsAppText = `*Se te ha delegado una nueva tarea*\n\nHola ${delegateName},\n\n${delegatorName || 'Un administrador'} te ha delegado la tarea:\n*${taskTitle}*\n\n${taskUrl ? `Detalles: ${taskUrl}` : ''}`;
        await sendWhatsAppMessage(jid, whatsAppText);
      }
    } catch (waError) {
      console.error('[WA] error in integration', waError);
    }

    return emailResult;
  }
);

// ================================
// FUNCIÓN: INVITACIÓN
// ================================
export const onInvitationCreatedSendEmail = onDocumentCreated(
  {
    document: 'invitations/{email}',
    region: 'us-central1',
    secrets: [RESEND_API_KEY_SM],
  },
  async event => {
    const snap = event.data;
    if (!snap) return;

    const {
      email,
      registrationUrl,
      inviterName = 'Un colega',
    } = snap.data() as any;
    if (!email || !registrationUrl) return;

    const subject = 'Invitación a Gestor D&G';
    const html = `
      <h1>Has sido invitado</h1>
      <p>${inviterName} te invitó a Gestor D&G</p>
      <a href="${registrationUrl}">Crear cuenta</a>
    `;

    return sendEmail({to: email, subject, html});
  }
);

// ================================
// FUNCIÓN: SUPLANTACIÓN
// ================================
export const createImpersonationToken = onCall(
  {region: 'us-central1'},
  async request => {
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError('permission-denied', 'Solo admin.');
    }

    const email = request.data.email;
    if (!email) {
      throw new HttpsError('invalid-argument', 'Email requerido.');
    }

    const user = await admin.auth().getUserByEmail(email);
    const token = await admin.auth().createCustomToken(user.uid, {
      impersonating: true,
    });

    return {token};
  }
);

// ================================
// FUNCIÓN: EMAIL DE PRUEBA
// ================================
export const sendTestEmail = onCall(
  {region: 'us-central1', secrets: [RESEND_API_KEY_SM]},
  async request => {
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError('permission-denied', 'Solo admin.');
    }

    const {to, subject, message} = request.data;
    if (!to || !subject || !message) {
      throw new HttpsError(
        'invalid-argument',
        'Se requieren destinatario, asunto y mensaje.'
      );
    }

    const html = `<p>${message}</p><p>Este es un correo de prueba.</p>`;
    return sendEmail({to, subject, html});
  }
);

// ================================
// FUNCIÓN: SINCRONIZACIÓN GLOBAL DE UIDs
// ================================
export const syncAllTeamMemberUIDs = onCall(
  {region: 'us-central1'},
  async request => {
    // 1. Check for Admin privileges
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError(
        'permission-denied',
        'Esta operación solo puede ser ejecutada por un administrador.'
      );
    }

    const db = admin.firestore();
    let updatedCount = 0;

    try {
      // 2. Create a master map of all correct email -> UID pairs
      const allUsersSnap = await db.collection('users').get();
      const emailToCorrectUidMap = new Map<string, string>();
      allUsersSnap.forEach(doc => {
        const userData = doc.data();
        if (userData.email) {
          emailToCorrectUidMap.set(userData.email, doc.id);
        }
      });

      // 3. Get all 'teamMembers' documents from all users
      const allTeamMembersSnap = await db.collectionGroup('teamMembers').get();
      const batch = db.batch();

      // 4. Iterate and check for inconsistencies
      allTeamMembersSnap.forEach(memberDoc => {
        const member = memberDoc.data();
        const correctUid = emailToCorrectUidMap.get(member.email);

        if (correctUid && member.uid !== correctUid) {
          batch.update(memberDoc.ref, {uid: correctUid});
          updatedCount++;
        }
      });

      // 5. Commit the batch if there are updates
      if (updatedCount > 0) {
        await batch.commit();
      }

      return {success: true, updatedCount: updatedCount};
    } catch (error: any) {
      console.error(
        'Error catastrófico durante la sincronización global de UIDs: ',
        error
      );
      throw new HttpsError(
        'internal',
        'Falló la sincronización global. Revisa los logs de la función.',
        {
          errorMessage: error.message,
        }
      );
    }
  }
);

// ================================
// FUNCIÓN: MIGRACIÓN DE OWNER IDs
// ================================
export const migrateOwnerIds = onCall(
  {region: 'us-central1'},
  async request => {
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError('permission-denied', 'Solo admin.');
    }

    const db = admin.firestore();
    let updatedCount = 0;
    const notFoundMembers: string[] = [];

    try {
      const allUsersSnap = await db.collection('users').get();
      const batch = db.batch();
      const userDocs = allUsersSnap.docs;

      for (const userDoc of userDocs) {
        const ownerId = userDoc.id;
        const teamMembersSnap = await userDoc.ref
          .collection('teamMembers')
          .get();

        for (const memberDoc of teamMembersSnap.docs) {
          const memberId = memberDoc.id;
          const memberProfileRef = db.collection('users').doc(memberId);

          // Check if the member's profile document exists before trying to update it
          const memberProfileSnap = await memberProfileRef.get();
          if (memberProfileSnap.exists) {
            // Only update if the ownerId is not already set to the correct one
            const currentOwnerId = memberProfileSnap.data()?.ownerId;
            if (currentOwnerId !== ownerId) {
              batch.update(memberProfileRef, {ownerId: ownerId});
              updatedCount++;
            }
          } else {
            // Log if the member document doesn't exist to identify "ghost" members
            notFoundMembers.push(memberId);
            console.warn(
              `Skipping member update: User document not found for memberId: ${memberId} in owner's (${ownerId}) team.`
            );
          }
        }
      }

      if (updatedCount > 0) {
        await batch.commit();
      }

      return {
        success: true,
        updatedCount: updatedCount,
        notFoundCount: notFoundMembers.length,
        notFoundMembers: notFoundMembers,
      };
    } catch (error: any) {
      console.error('Error durante la migración de ownerId: ', error);
      throw new HttpsError(
        'internal',
        'Falló la migración de ownerId. Revisa los logs de la función.',
        {errorMessage: error.message}
      );
    }
  }
);
