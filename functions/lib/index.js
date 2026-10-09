"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmailTask = exports.onSupportTicketCreated = exports.deleteUserAccount = exports.generatePasswordLink = exports.registerTeamMember = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const firestore_2 = require("firebase-admin/firestore");
const resend_1 = require("resend");
const params_1 = require("firebase-functions/params");
const RESEND_API_KEY_SM = (0, params_1.defineSecret)('RESEND_API_KEY_SM');
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
async function sendEmail(params, apiKey) {
    if (!apiKey || apiKey.trim().length < 10) {
        console.error('Invalid API Key for Resend.');
        throw new https_1.HttpsError('failed-precondition', 'La configuración de envío de correos no es válida en el servidor.');
    }
    const resend = new resend_1.Resend(apiKey);
    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [params.to],
            subject: params.subject,
            html: params.html,
        });
        if (error) {
            console.error('Resend API Error:', error);
            throw new https_1.HttpsError('internal', `Error de Resend: ${error.message}`);
        }
        return { success: true, id: data?.id };
    }
    catch (err) {
        console.error('Error enviando correo:', err);
        throw new https_1.HttpsError('internal', err.message || 'Error enviando correo');
    }
}
// ================================
// WHATSAPP HELPERS
// ================================
function normalizeToWhatsAppJid(phone) {
    if (!phone)
        return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('521') && digits.length === 13)
        return `${digits}@s.whatsapp.net`;
    if (digits.startsWith('52') && digits.length === 12)
        return `521${digits.slice(2)}@s.whatsapp.net`;
    if (digits.length === 10)
        return `521${digits}@s.whatsapp.net`;
    return null;
}
async function sendWhatsAppMessage(to, text) {
    const url = 'https://baileys-worker-dev-24342745173.us-central1.run.app/v1/channels/yE1vsdQcwWGuxvNoFIFr/messages/send';
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, text }),
        });
    }
    catch (error) {
        console.error('[WA] error sending message', error);
    }
}
// ================================
// HELPERS DE LIGA DE CONTRASEÑA
// ================================
const PASSWORD_SETUP_CONTINUE_URL = 'https://gestor.fiscalflow.mx/login';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
/**
 * Genera la liga nativa de Firebase (…/__/auth/action?mode=resetPassword…) con Admin SDK.
 * La liga NO se guarda en ninguna base: se genera bajo demanda cada vez que se necesita.
 * Si el dominio de continuación no está autorizado en Authentication, se genera sin continueUrl
 * (igual que Termal Cosalá), para que la liga siempre sea funcional.
 */
async function createPasswordLink(email) {
    try {
        return await admin.auth().generatePasswordResetLink(email, { url: PASSWORD_SETUP_CONTINUE_URL });
    }
    catch (err) {
        if (err?.code === 'auth/unauthorized-continue-uri' || err?.code === 'auth/invalid-continue-uri') {
            console.warn('continueUrl no autorizado, generando liga sin ActionCodeSettings:', err.code);
            return admin.auth().generatePasswordResetLink(email);
        }
        throw err;
    }
}
function isAdminCaller(auth) {
    const callerEmail = (auth.token.email || '').toLowerCase();
    return auth.uid === ADMIN_UID || ADMIN_EMAILS.some(e => e.toLowerCase() === callerEmail);
}
/**
 * Regla real del sistema (derivada de la UI y firestore.rules):
 *  - Admin global (ADMIN_UID / ADMIN_EMAILS): puede dar de alta miembros bajo cualquier líder
 *    (vista "Estructura Global") y administrar a cualquier usuario.
 *  - Usuario registrado en Gestor DYG (tiene users/{uid}): puede dar de alta miembros
 *    SOLO en su propio equipo (vista "Equipo": inviterId = su propio uid).
 *  - Cualquier otra cuenta de Auth sin perfil: sin permiso.
 */
async function callerHasProfile(uid) {
    const snap = await admin.firestore().collection('users').doc(uid).get();
    return snap.exists;
}
function profileBossIds(data) {
    if (!data)
        return [];
    if (Array.isArray(data.ownerIds))
        return data.ownerIds.filter((v) => typeof v === 'string');
    return typeof data.ownerId === 'string' && data.ownerId ? [data.ownerId] : [];
}
// ================================
// REGISTRO DE MIEMBRO POR ADMIN
// ================================
// Usa Firebase Admin SDK (createUser) en backend: la sesión de quien llama NUNCA cambia.
exports.registerTeamMember = (0, https_1.onCall)({ region: 'us-central1', secrets: [RESEND_API_KEY_SM] }, async (request) => {
    // 1. Verificación de Autenticación
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Requiere iniciar sesión.');
    const callerUid = request.auth.uid;
    const callerIsAdmin = isAdminCaller(request.auth);
    // 1b. Autorización en backend (no depende de que el botón esté oculto en la UI)
    if (!callerIsAdmin && !(await callerHasProfile(callerUid))) {
        throw new https_1.HttpsError('permission-denied', 'No tienes permiso para dar de alta miembros.');
    }
    const { email: rawEmail, name: rawName, role: rawRole, inviterId: rawInviterId, password, phone } = request.data;
    // 1c. inviterId: un usuario normal solo puede crear miembros en SU propio equipo.
    // Solo el admin global puede indicar otro líder (o ninguno) como en "Estructura Global".
    let inviterId = callerUid;
    if (callerIsAdmin) {
        if (rawInviterId === null || rawInviterId === undefined || rawInviterId === '' || rawInviterId === 'none') {
            inviterId = (rawInviterId === undefined || rawInviterId === '') ? callerUid : null;
        }
        else if (typeof rawInviterId === 'string') {
            if (!(await callerHasProfile(rawInviterId))) {
                throw new https_1.HttpsError('invalid-argument', 'El líder indicado no existe.');
            }
            inviterId = rawInviterId;
        }
        else {
            throw new https_1.HttpsError('invalid-argument', 'El líder indicado no es válido.');
        }
    }
    else if (rawInviterId && rawInviterId !== 'none' && rawInviterId !== callerUid) {
        throw new https_1.HttpsError('permission-denied', 'Solo puedes dar de alta miembros en tu propio equipo.');
    }
    // El nombre de quien invita se toma del servidor, no del cliente (evita suplantación en el correo).
    let inviterName = 'Un Administrador';
    try {
        const callerSnap = await admin.firestore().collection('users').doc(callerUid).get();
        const n = callerSnap.data()?.name || request.auth.token.name;
        if (typeof n === 'string' && n.trim())
            inviterName = n.trim();
    }
    catch (e) { /* se usa el valor por defecto */ }
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    const role = typeof rawRole === 'string' ? rawRole.trim() : '';
    const cleanPassword = typeof password === 'string' ? password.trim() : '';
    if (!email || !name || !role)
        throw new https_1.HttpsError('invalid-argument', 'Datos incompletos (email, nombre y rol son obligatorios).');
    if (!EMAIL_REGEX.test(email))
        throw new https_1.HttpsError('invalid-argument', 'El correo electrónico no es válido.');
    if (cleanPassword && cleanPassword.length < 6)
        throw new https_1.HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
    let apiKey = '';
    try {
        apiKey = RESEND_API_KEY_SM.value();
    }
    catch (e) {
        console.error("Secret RESEND_API_KEY_SM not available");
    }
    // 2. Configurar opciones de Auth (sin contraseña => el usuario la define con la liga)
    const authOptions = { email, displayName: name };
    if (cleanPassword)
        authOptions.password = cleanPassword;
    // Sanitización de teléfono para formato E.164
    if (phone && String(phone).trim() !== '') {
        const digits = String(phone).replace(/\D/g, '');
        if (digits.length >= 10) {
            authOptions.phoneNumber = String(phone).startsWith('+') ? String(phone) : `+52${digits.slice(-10)}`;
        }
    }
    // 3. Crear usuario en Firebase Auth (Admin SDK)
    const userRecord = await admin.auth().createUser(authOptions).catch((err) => {
        console.error('Auth creation error:', err?.code);
        if (err.code === 'auth/email-already-exists')
            throw new https_1.HttpsError('already-exists', 'Este correo ya está registrado en el sistema.');
        if (err.code === 'auth/invalid-email')
            throw new https_1.HttpsError('invalid-argument', 'El correo electrónico no es válido.');
        if (err.code === 'auth/invalid-password')
            throw new https_1.HttpsError('invalid-argument', 'La contraseña no es válida (mínimo 6 caracteres).');
        if (err.code === 'auth/invalid-phone-number')
            throw new https_1.HttpsError('invalid-argument', 'El formato del número de teléfono no es válido.');
        if (err.code === 'auth/phone-number-already-exists')
            throw new https_1.HttpsError('already-exists', 'Este número de teléfono ya está en uso.');
        throw new https_1.HttpsError('internal', 'No se pudo crear la cuenta en Firebase Authentication.');
    });
    const uid = userRecord.uid;
    const db = admin.firestore();
    const hasInviter = !!inviterId;
    // 4. Crear perfil (y vínculo de equipo) en Firestore en una sola escritura atómica
    try {
        const avatarUrl = `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid}`;
        const batch = db.batch();
        batch.set(db.collection('users').doc(uid), {
            uid,
            name,
            email,
            role,
            phone: phone || '',
            avatarUrl,
            ownerIds: hasInviter ? [inviterId] : [],
            ownerId: hasInviter ? inviterId : null,
            createdAt: firestore_2.FieldValue.serverTimestamp(),
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        });
        if (hasInviter) {
            batch.set(db.collection('users').doc(inviterId).collection('teamMembers').doc(uid), {
                id: uid,
                uid,
                name,
                email,
                role,
                avatarUrl,
                phone: phone || '',
                authType: 'email',
            });
        }
        await batch.commit();
    }
    catch (fsError) {
        console.error('Firestore write failed, rolling back Auth user:', fsError?.code || fsError?.message);
        // Rollback seguro: solo se elimina la cuenta de Auth recién creada en esta misma llamada.
        await admin.auth().deleteUser(uid).catch(e => console.error('Rollback of Auth user failed:', e?.code));
        throw new https_1.HttpsError('internal', 'No se pudo guardar el perfil del usuario en la base de datos. No se creó la cuenta; intenta de nuevo.');
    }
    // 5. Generar liga nativa de Firebase (en ambos casos, con o sin contraseña)
    let resetLink = null;
    try {
        resetLink = await createPasswordLink(email);
    }
    catch (linkError) {
        console.error('Error generating reset link:', linkError?.code || linkError?.message);
    }
    // 6. Correo vía Resend
    let emailSent = false;
    let warning;
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    if (!cleanPassword) {
        if (!resetLink) {
            warning = 'Usuario creado, pero no se pudo generar la liga de contraseña. Usa el botón "Liga contraseña" en Estructura Global para generarla.';
        }
        else if (!apiKey) {
            warning = 'Usuario creado, pero el envío de correos no está configurado. Comparte la liga manualmente.';
        }
        else {
            const subject = `Bienvenido a Gestor D&G - Configura tu acceso`;
            const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h1 style="color: #3f51b5;">Bienvenido al equipo, ${safeName}</h1>
                <p>${escapeHtml(inviterName)} te ha dado de alta en la plataforma de Gestión Fiscal.</p>
                <p>Para comenzar a trabajar, necesitas definir tu contraseña haciendo clic en el siguiente botón:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}" style="padding: 12px 25px; background: #3f51b5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Definir mi Contraseña</a>
                </div>
                <p style="color: #666; font-size: 12px;">Tu usuario de acceso es: <strong>${safeEmail}</strong></p>
            </div>
        `;
            try {
                await sendEmail({ to: email, subject, html }, apiKey);
                emailSent = true;
            }
            catch (mailError) {
                console.error('Welcome email failed:', mailError?.message);
                warning = 'Usuario creado, pero no se pudo enviar el correo. Comparte la liga manualmente.';
            }
        }
    }
    else if (apiKey) {
        const subject = `Tu cuenta en Gestor D&G está lista`;
        const html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h1 style="color: #3f51b5;">Hola ${safeName}, bienvenido</h1>
              <p>Se ha creado tu acceso para la plataforma de Gestor D&G.</p>
              <p>Puedes entrar ahora mismo con las siguientes credenciales:</p>
              <p><strong>Usuario:</strong> ${safeEmail}</p>
              <p><strong>Contraseña:</strong> (La asignada por tu administrador)</p>
              <div style="text-align: center; margin: 30px 0;">
                  <a href="https://gestor.fiscalflow.mx/login" style="padding: 12px 25px; background: #3f51b5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Acceder al Sistema</a>
              </div>
          </div>
      `;
        try {
            await sendEmail({ to: email, subject, html }, apiKey);
            emailSent = true;
        }
        catch (mailError) {
            console.error('Welcome email failed:', mailError?.message);
            warning = 'Usuario creado, pero no se pudo enviar el correo de aviso.';
        }
    }
    return { success: true, uid, resetLink, emailSent, ...(warning ? { warning } : {}) };
});
// ================================
// LIGA DE CONTRASEÑA PARA USUARIO EXISTENTE (ADMIN)
// ================================
// Genera bajo demanda una liga nueva con Admin SDK. No guarda la liga ni modifica al usuario.
exports.generatePasswordLink = (0, https_1.onCall)({ region: 'us-central1' }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Requiere iniciar sesión.');
    const callerUid = request.auth.uid;
    const callerIsAdmin = isAdminCaller(request.auth);
    const { uid, email } = request.data;
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!uid && !cleanEmail)
        throw new https_1.HttpsError('invalid-argument', 'Se requiere el uid o el correo del usuario.');
    // Resolución del usuario destino. Para no admins, cualquier fallo es permission-denied
    // (no se revela si el usuario existe).
    const denied = () => new https_1.HttpsError('permission-denied', 'No tienes permiso para generar la liga de este usuario.');
    const userRecord = await (uid ? admin.auth().getUser(uid) : admin.auth().getUserByEmail(cleanEmail)).catch((err) => {
        if (err?.code === 'auth/user-not-found') {
            throw callerIsAdmin ? new https_1.HttpsError('not-found', 'El usuario no existe en Firebase Authentication.') : denied();
        }
        console.error('getUser failed:', err?.code);
        throw new https_1.HttpsError('internal', 'No se pudo consultar al usuario en Firebase Authentication.');
    });
    // Autorización: admin global, o jefe directo (ownerId/ownerIds) del usuario destino.
    // Un jefe nunca puede generar la liga de una cuenta de administrador global.
    if (!callerIsAdmin) {
        const targetIsAdmin = userRecord.uid === ADMIN_UID ||
            ADMIN_EMAILS.some(e => e.toLowerCase() === (userRecord.email || '').toLowerCase());
        const targetSnap = await admin.firestore().collection('users').doc(userRecord.uid).get();
        if (targetIsAdmin || !profileBossIds(targetSnap.data()).includes(callerUid))
            throw denied();
    }
    if (!userRecord.email)
        throw new https_1.HttpsError('failed-precondition', 'El usuario no tiene correo electrónico registrado.');
    try {
        const resetLink = await createPasswordLink(userRecord.email);
        return { success: true, uid: userRecord.uid, email: userRecord.email, resetLink };
    }
    catch (err) {
        console.error('generatePasswordLink failed:', err?.code || err?.message);
        throw new https_1.HttpsError('internal', 'No se pudo generar la liga de contraseña. Intenta de nuevo.');
    }
});
// ================================
// ELIMINACIÓN DE USUARIO (ADMIN)
// ================================
exports.deleteUserAccount = (0, https_1.onCall)({ region: 'us-central1' }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Requiere login.');
    const isAdmin = request.auth.uid === ADMIN_UID || ADMIN_EMAILS.includes(request.auth.token.email || '');
    if (!isAdmin)
        throw new https_1.HttpsError('permission-denied', 'Solo administradores pueden eliminar cuentas.');
    const { uid } = request.data;
    if (!uid)
        throw new https_1.HttpsError('invalid-argument', 'UID del usuario es requerido.');
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
    }
    catch (error) {
        console.error('Error deleting user:', error);
        throw new https_1.HttpsError('internal', `Error al intentar eliminar la cuenta del usuario: ${error.message}`);
    }
});
// ================================
// NOTIFICACIÓN TICKET SOPORTE
// ================================
exports.onSupportTicketCreated = (0, firestore_1.onDocumentCreated)({ document: 'supportTickets/{ticketId}', region: 'us-central1', secrets: [RESEND_API_KEY_SM] }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const ticket = snap.data();
    if (!ticket)
        return;
    let apiKey = '';
    try {
        apiKey = RESEND_API_KEY_SM.value();
    }
    catch (e) {
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
});
// ================================
// FUNCIÓN: TAREA DELEGADA
// ================================
exports.sendEmailTask = (0, https_1.onCall)({ region: 'us-central1', secrets: [RESEND_API_KEY_SM] }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Requiere login.');
    const { to, taskTitle, delegateName, taskUrl, delegatorName, delegateId } = request.data;
    let apiKey = '';
    try {
        apiKey = RESEND_API_KEY_SM.value();
    }
    catch (e) {
        throw new https_1.HttpsError('failed-precondition', 'Configuración de correo no disponible.');
    }
    const subject = `Nueva tarea delegada: ${taskTitle.replace(/\n/g, ' ')}`;
    const html = `<h1>Se te ha delegado una nueva tarea</h1><p>Hola ${delegateName},</p><p>${delegatorName || 'Un administrador'} te ha delegado la tarea:</p><p><strong>${taskTitle}</strong></p>${taskUrl ? `<p>Detalles: <a href="${taskUrl}">${taskUrl}</a></p>` : ''}`;
    await sendEmail({ to, subject, html }, apiKey);
    try {
        let phone = null;
        if (delegateId) {
            const userDoc = await admin.firestore().collection('users').doc(delegateId).get();
            if (userDoc.exists)
                phone = userDoc.data()?.phone || null;
        }
        const jid = normalizeToWhatsAppJid(phone);
        if (jid) {
            const whatsAppText = `*Se te ha delegado una nueva tarea*\n\nHola ${delegateName},\n\n${delegatorName || 'Un administrador'} te ha delegado la tarea:\n*${taskTitle}*\n\n${taskUrl ? `Detalles: ${taskUrl}` : ''}`;
            await sendWhatsAppMessage(jid, whatsAppText);
        }
    }
    catch (waError) { }
    return { success: true };
});
//# sourceMappingURL=index.js.map