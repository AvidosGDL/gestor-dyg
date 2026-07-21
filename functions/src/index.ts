
'use client';

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
admin.initializeApp();

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
// NOTIFICACIÓN TICKET SOPORTE
// ================================
export const onSupportTicketCreated = onDocumentCreated(
  { document: 'supportTickets/{ticketId}', region: 'us-central1', secrets: [RESEND_API_KEY_SM] },
  async event => {
    const snap = event.data;
    if (!snap) return;
    const ticket = snap.data();
    const { type, description, severity, creatorName, creatorEmail } = ticket;

    const subject = `[NUEVO TICKET] ${type === 'bug' ? 'BUG' : 'MEJORA'} - Prioridad ${severity}`;
    const html = `
      <h1>Nuevo Reporte de Sistema</h1>
      <p><strong>Reportado por:</strong> ${creatorName} (${creatorEmail})</p>
      <p><strong>Tipo:</strong> ${type}</p>
      <p><strong>Severidad:</strong> ${severity}</p>
      <p><strong>Descripción:</strong> ${description}</p>
      <p><strong>Navegador:</strong> ${ticket.browser}</p>
      <p><strong>Dispositivo:</strong> ${ticket.device}</p>
    `;

    // Email to admins
    for (const email of ADMIN_EMAILS) {
      await sendEmail({ to: email, subject, html });
    }

    // WhatsApp to admins (Requires their phone numbers from profiles)
    const adminDocs = await admin.firestore().collection('users').where('email', 'in', ADMIN_EMAILS).get();
    const waText = `*NUEVO TICKET DE SOPORTE*\n\nTipo: ${type}\nPrioridad: ${severity}\nReporta: ${creatorName}\n\nDescripción: ${description}`;
    
    for (const adminDoc of adminDocs.docs) {
      const phone = adminDoc.data()?.phone;
      const jid = normalizeToWhatsAppJid(phone);
      if (jid) await sendWhatsAppMessage(jid, waText);
    }
  }
);

export const onSupportTicketUpdated = onDocumentUpdated(
  { document: 'supportTickets/{ticketId}', region: 'us-central1' },
  async event => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Check if ticket was closed
    if (before.status === 'open' && after.status === 'closed') {
      const creatorId = after.creatorId;
      const userDoc = await admin.firestore().collection('users').doc(creatorId).get();
      const phone = userDoc.data()?.phone;
      const jid = normalizeToWhatsAppJid(phone);
      
      if (jid) {
        const waText = `*TU TICKET HA SIDO RESUELTO*\n\nHola ${after.creatorName},\n\nTu reporte sobre "${after.description.substring(0, 50)}..." ha sido cerrado.\n\n*Solución:* ${after.solution}`;
        await sendWhatsAppMessage(jid, waText);
      }
    }
  }
);

// Existing functions below...
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

export const onInvitationCreatedSendEmail = onDocumentCreated(
  { document: 'invitations/{email}', region: 'us-central1', secrets: [RESEND_API_KEY_SM] },
  async event => {
    const snap = event.data;
    if (!snap) return;
    const { email, registrationUrl, inviterName = 'Un colega' } = snap.data() as any;
    const subject = 'Invitación a Gestor D&G';
    const html = `<h1>Has sido invitado</h1><p>${inviterName} te invitó a Gestor D&G</p><a href="${registrationUrl}">Crear cuenta</a>`;
    return sendEmail({to: email, subject, html});
  }
);

export const createImpersonationToken = onCall(
  {region: 'us-central1'},
  async request => {
    if (!request.auth || request.auth.uid !== ADMIN_UID) throw new HttpsError('permission-denied', 'Solo admin.');
    const email = request.data.email;
    const user = await admin.auth().getUserByEmail(email);
    const token = await admin.auth().createCustomToken(user.uid, { impersonating: true });
    return {token};
  }
);
