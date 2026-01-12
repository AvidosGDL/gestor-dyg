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
exports.sendTestEmail = exports.createImpersonationToken = exports.onInvitationCreatedSendEmail = exports.sendEmailTask = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const resend_1 = require("resend");
// ================================
// CONFIGURACIÓN DIRECTA (SIN SECRET)
// ================================
const RESEND_API_KEY = "[REMOVED_RESEND_API_KEY]";
// The Admin UID is a constant
const ADMIN_UID = "fKZUAAXTENPcUeEA4tUXFEV4xbr1";
// Initialize Firebase Admin SDK
admin.initializeApp();
// From email
const FROM_EMAIL = "Gestor D&G <gestor@fiscalflow.mx>";
// ================================
// FUNCIÓN REUTILIZABLE DE ENVÍO
// ================================
async function sendEmail(params) {
    if (!RESEND_API_KEY || RESEND_API_KEY.trim().length < 10) {
        console.error("RESEND_API_KEY inválida o ausente");
        throw new https_1.HttpsError("failed-precondition", "La API Key de Resend no está configurada correctamente.");
    }
    const resend = new resend_1.Resend(RESEND_API_KEY);
    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [params.to],
            subject: params.subject,
            html: params.html,
        });
        if (error) {
            console.error("Resend error:", error);
            throw new https_1.HttpsError("internal", error.message);
        }
        return { success: true, id: data?.id };
    }
    catch (err) {
        console.error("Error enviando correo:", err);
        throw new https_1.HttpsError("internal", err.message || "Error enviando correo");
    }
}
// ================================
// FUNCIÓN: TAREA DELEGADA
// ================================
exports.sendEmailTask = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Requiere login.");
    }
    const { to, taskTitle, delegateName, taskUrl, delegatorName } = request.data;
    if (!to || !taskTitle || !delegateName) {
        throw new https_1.HttpsError("invalid-argument", "Datos incompletos.");
    }
    const subject = `Nueva tarea delegada: ${taskTitle}`;
    const html = `
    <h1>Nueva tarea</h1>
    <p>Hola ${delegateName},</p>
    <p>${delegatorName || "Un administrador"} te asignó la tarea:</p>
    <strong>${taskTitle}</strong>
    ${taskUrl ? `<p><a href="${taskUrl}">Ver tarea</a></p>` : ""}
  `;
    return sendEmail({ to, subject, html });
});
// ================================
// FUNCIÓN: INVITACIÓN
// ================================
exports.onInvitationCreatedSendEmail = (0, firestore_1.onDocumentCreated)({ document: "invitations/{email}", region: "us-central1" }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const { email, registrationUrl, inviterName = "Un colega" } = snap.data();
    if (!email || !registrationUrl)
        return;
    const subject = "Invitación a Gestor D&G";
    const html = `
      <h1>Has sido invitado</h1>
      <p>${inviterName} te invitó a Gestor D&G</p>
      <a href="${registrationUrl}">Crear cuenta</a>
    `;
    return sendEmail({ to: email, subject, html });
});
// ================================
// FUNCIÓN: SUPLANTACIÓN
// ================================
exports.createImpersonationToken = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
        throw new https_1.HttpsError("permission-denied", "Solo admin.");
    }
    const email = request.data.email;
    if (!email) {
        throw new https_1.HttpsError("invalid-argument", "Email requerido.");
    }
    const user = await admin.auth().getUserByEmail(email);
    const token = await admin.auth().createCustomToken(user.uid, {
        impersonating: true,
    });
    return { token };
});
// ================================
// FUNCIÓN: EMAIL DE PRUEBA
// ================================
exports.sendTestEmail = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    if (!request.auth || request.auth.uid !== ADMIN_UID) {
        throw new https_1.HttpsError("permission-denied", "Solo admin.");
    }
    const { to, subject, message } = request.data;
    if (!to || !subject || !message) {
        throw new https_1.HttpsError("invalid-argument", "Datos incompletos.");
    }
    const html = `<p>${message}</p><p>Email de prueba</p>`;
    return sendEmail({ to, subject, html });
});
//# sourceMappingURL=index.js.map