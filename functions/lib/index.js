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
exports.createImpersonationToken = exports.onInvitationCreatedSendEmail = exports.sendEmailTask = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const resend_1 = require("resend");
const ensureAdmin = () => {
    if (admin.apps.length === 0)
        admin.initializeApp();
};
// --- Resend (NO hardcode) ---
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "Gestor D&G <gestor@fiscalflow.mx>";
function getResend() {
    if (!RESEND_API_KEY) {
        console.warn("RESEND_API_KEY no está configurada. El envío de correos fallará.");
        return { emails: { send: () => Promise.resolve({ data: null, error: { message: "RESEND_API_KEY is not configured.", name: "missing_api_key" } }) } };
    }
    return new resend_1.Resend(RESEND_API_KEY);
}
async function sendEmail(params) {
    if (!RESEND_API_KEY) {
        console.error("No se puede enviar el correo porque RESEND_API_KEY no está configurada.");
        throw new https_1.HttpsError("failed-precondition", "La configuración del servidor de correo está incompleta.");
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
        throw new https_1.HttpsError("internal", `Error al enviar correo: ${error.message}`);
    }
    return { success: true, id: data?.id };
}
exports.sendEmailTask = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    ensureAdmin();
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Requiere login.");
    const data = (request.data ?? {});
    const to = data.to;
    const taskTitle = data.taskTitle;
    const delegateName = data.delegateName;
    const taskUrl = data.taskUrl;
    const delegatorName = data.delegatorName;
    if (!to || !taskTitle || !delegateName) {
        throw new https_1.HttpsError("invalid-argument", "Faltan datos.");
    }
    const subject = `Nueva tarea delegada: ${taskTitle}`;
    const html = `
      <h1>Se te ha delegado una nueva tarea</h1>
      <p>Hola ${delegateName},</p>
      <p>${delegatorName || 'Un administrador'} te ha delegado la tarea:</p>
      <p><strong>${taskTitle}</strong></p>
      ${taskUrl
        ? `<p>Puedes revisar los detalles aquí: <a href="${taskUrl}">${taskUrl}</a></p>`
        : ''}
      <p>Por favor, revisa la tarea en el sistema.</p>
    `;
    return sendEmail({ to, subject, html });
});
exports.onInvitationCreatedSendEmail = (0, firestore_1.onDocumentCreated)({ document: "invitations/{email}", region: "us-central1" }, async (event) => {
    ensureAdmin();
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data();
    const email = data.email;
    const registrationUrl = data.registrationUrl;
    const inviterName = data.inviterName || "Un colega";
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
});
exports.createImpersonationToken = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    // Versión mínima para prueba de despliegue.
    console.log("createImpersonationToken fue llamada (versión de prueba)");
    return { status: "Función de prueba desplegada correctamente." };
});
//# sourceMappingURL=index.js.map