import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onUserCreate } from "firebase-functions/v2/identity";
import * as admin from "firebase-admin";
import { Resend } from "resend";
import { defineSecret } from "firebase-functions/params";

const RESEND_API_KEY_SM = defineSecret("RESEND_API_KEY_SM");

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
  const key = RESEND_API_KEY_SM.value();

  // Preflight check to ensure the key is loaded
  if (!key || key.trim().length < 10) {
    console.error("Missing or invalid RESEND_API_KEY_SM secret at runtime. Length:", key?.length ?? 0);
    throw new HttpsError(
      "failed-precondition",
      "El secreto de la API para enviar correos (RESEND_API_KEY_SM) no está configurado correctamente en el servidor."
    );
  }

  const resend = new Resend(key);

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error("Resend API Error:", error);
      throw new HttpsError("internal", `Error from Resend: ${error.message}`);
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
export const sendEmailTask = onCall({ region: "us-central1", secrets: [RESEND_API_KEY_SM] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Requiere login.");
  }

  const { to, taskTitle, delegateName, taskUrl, delegatorName } = request.data as any;

  if (!to || !taskTitle || !delegateName) {
    throw new HttpsError("invalid-argument", "Datos incompletos (to, taskTitle, delegateName).");
  }

  const subject = `Nueva tarea delegada: ${taskTitle}`;
  const html = `
    <h1>Se te ha delegado una nueva tarea</h1>
    <p>Hola ${delegateName},</p>
    <p>${delegatorName || "Un administrador"} te ha delegado la tarea:</p>
    <p><strong>${taskTitle}</strong></p>
    ${taskUrl ? `<p>Detalles: <a href="${taskUrl}">${taskUrl}</a></p>` : ""}
  `;

  return sendEmail({ to, subject, html });
});

// ================================
// FUNCIÓN: INVITACIÓN
// ================================
export const onInvitationCreatedSendEmail = onDocumentCreated(
  { document: "invitations/{email}", region: "us-central1", secrets: [RESEND_API_KEY_SM] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { email, registrationUrl, inviterName = "Un colega" } = snap.data() as any;
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
// FUNCIÓN: POST-REGISTRO DE USUARIO NUEVO
// ================================
export const onNewUserCreate = onUserCreate({ region: "us-central1" }, async (event) => {
  const user = event.data;
  const { email, uid, displayName, photoURL } = user;

  if (!email) {
    console.log(`User ${uid} has no email, cannot process invitation.`);
    return;
  }

  const db = admin.firestore();
  const invitationRef = db.collection('invitations').doc(email);
  const userRef = db.collection('users').doc(uid);

  try {
    const invitationSnap = await invitationRef.get();
    if (!invitationSnap.exists) {
      console.log(`No invitation found for ${email}.`);
      return;
    }

    const invitationData = invitationSnap.data()!;
    const { inviterId } = invitationData;
    
    // Ensure user profile exists (created on client but good to be robust)
    const userProfileSnap = await userRef.get();
    const userProfileData = userProfileSnap.data();

    if (!userProfileData) {
        console.error(`User profile for ${uid} does not exist. Cannot add to team.`);
        return;
    }

    const batch = db.batch();

    // 1. Add new user to the inviter's team
    if (inviterId) {
      const teamMemberRef = db.collection('users').doc(inviterId).collection('teamMembers').doc(uid);
      const teamMemberData = {
        id: uid,
        uid: uid,
        name: displayName || userProfileData.name,
        email: email,
        role: userProfileData.role || 'Miembro',
        avatarUrl: photoURL || userProfileData.avatarUrl,
        phone: user.phoneNumber || userProfileData.phone || '',
        authType: 'email',
      };
      batch.set(teamMemberRef, teamMemberData, { merge: true });
    }

    // 2. Link pending tasks for this email
    const tasksToUpdateQuery = db.collection('tasks')
      .where('delegateToEmail', '==', email)
      .where('delegateToId', '==', null);

    const tasksSnapshot = await tasksToUpdateQuery.get();
    if (!tasksSnapshot.empty) {
      tasksSnapshot.forEach(taskDoc => {
        batch.update(taskDoc.ref, { delegateToId: uid });
      });
    }

    // 3. Delete the invitation
    batch.delete(invitationRef);

    // Commit all operations
    await batch.commit();
    console.log(`Successfully processed invitation for ${email} and added to team of ${inviterId}.`);

  } catch (error) {
    console.error(`Error processing invitation for ${email}:`, error);
  }
});


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
  { region: "us-central1", secrets: [RESEND_API_KEY_SM] },
  async (request) => {
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
      throw new HttpsError("permission-denied", "Solo admin.");
    }

    const { to, subject, message } = request.data;
    if (!to || !subject || !message) {
      throw new HttpsError("invalid-argument", "Se requieren destinatario, asunto y mensaje.");
    }

    const html = `<p>${message}</p><p>Este es un correo de prueba.</p>`;
    return sendEmail({ to, subject, html });
  }
);
