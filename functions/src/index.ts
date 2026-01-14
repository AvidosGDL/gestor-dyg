
'use client';

import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {onUserCreated, UserCreatedEvent} from 'firebase-functions/v2/auth';
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
// FUNCIÓN: TAREA DELEGADA
// ================================
export const sendEmailTask = onCall(
  {region: 'us-central1', secrets: [RESEND_API_KEY_SM]},
  async request => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Requiere login.');
    }

    const {to, taskTitle, delegateName, taskUrl, delegatorName} =
      request.data as any;

    if (!to || !taskTitle || !delegateName) {
      throw new HttpsError(
        'invalid-argument',
        'Datos incompletos (to, taskTitle, delegateName).'
      );
    }

    const subject = `Nueva tarea delegada: ${taskTitle}`;
    const html = `
    <h1>Se te ha delegado una nueva tarea</h1>
    <p>Hola ${delegateName},</p>
    <p>${
      delegatorName || 'Un administrador'
    } te ha delegado la tarea:</p>
    <p><strong>${taskTitle}</strong></p>
    ${taskUrl ? `<p>Detalles: <a href="${taskUrl}">${taskUrl}</a></p>` : ''}
  `;

    return sendEmail({to, subject, html});
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

    try {
      const allUsersSnap = await db.collection('users').get();
      const batch = db.batch();

      for (const userDoc of allUsersSnap.docs) {
        const ownerId = userDoc.id;
        const teamMembersSnap = await userDoc.ref
          .collection('teamMembers')
          .get();

        teamMembersSnap.forEach(memberDoc => {
          const memberId = memberDoc.id;
          const memberProfileRef = db.collection('users').doc(memberId);
          batch.update(memberProfileRef, {ownerId: ownerId});
          updatedCount++;
        });
      }

      if (updatedCount > 0) {
        await batch.commit();
      }

      return {success: true, updatedCount: updatedCount};
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

    