
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
var __importStar = (this && this.__importStar) || (function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
});
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInvitationEmail = exports.sendEmailTask = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const resend_1 = require("resend");
admin.initializeApp();
const resend = new resend_1.Resend('[REMOVED_RESEND_API_KEY]');
exports.sendEmailTask = (0, https_1.onCall)({ region: 'us-central1' }, async (request) => {
    var _a, _b;
    console.log('[sendEmailTask] Petición recibida', {
        data: request.data,
        authUid: (_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid) !== null && _b !== void 0 ? _b : null,
    });
    if (!request.auth) {
        console.error('[sendEmailTask] Unauthenticated call.');
        throw new https_1.HttpsError("unauthenticated", "The function must be called by an authenticated user.");
    }
    const data = request.data;
    if (!data.to || !data.taskId || !data.taskTitle || !data.delegateName) {
        console.error('[sendEmailTask] Datos incompletos', { data });
        throw new https_1.HttpsError("invalid-argument", "Faltan datos para enviar el correo de delegación.");
    }
    try {
        const { to, taskId, taskTitle, delegatorName, delegateName, taskUrl } = data;
        const effectiveDelegatorName = delegatorName || 'un administrador';
        console.log('[sendEmailTask] Preparing to send email', { to, taskId, taskTitle });
        const { data: resendData, error } = await resend.emails.send({
            from: 'Gestor D&G <gestor@fiscalflow.mx>',
            to: [to],
            subject: `Nueva tarea delegada: ${taskTitle}`,
            html: `
          <h1>Se te ha delegado una nueva tarea</h1>
          <p>Hola ${delegateName},</p>
          <p>${effectiveDelegatorName} te ha delegado la tarea:</p>
          <p><strong>${taskTitle}</strong> (ID: ${taskId})</p>
          ${taskUrl ? `<p>Puedes revisar los detalles aquí: <a href="${taskUrl}">${taskUrl}</a></p>` : ''}
          <p>Por favor, revisa la tarea en el sistema.</p>
        `,
        });
        if (error) {
            console.error('[sendEmailTask] Error returned by Resend', { to, taskId, error });
            throw new https_1.HttpsError("internal", `Error sending email with Resend: ${error.message ?? 'no message'}`);
        }
        console.log('[sendEmailTask] Email sent successfully', { to, taskId, resendId: resendData === null || resendData === void 0 ? void 0 : resendData.id });
        return { success: true, id: resendData === null || resendData === void 0 ? void 0 : resendData.id };
    }
    catch (err) {
        console.error('[sendEmailTask] Exception while sending email', {
            error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: String(err) },
        });
        if (err instanceof https_1.HttpsError) {
            throw err;
        }
        throw new https_1.HttpsError("internal", err instanceof Error ? err.message : "Error desconocido al enviar correo.");
    }
});
exports.sendInvitationEmail = (0, https_1.onCall)({ region: 'us-central1' }, async (request) => {
    var _c, _d;
    console.log('[sendInvitationEmail] Petición recibida', {
        data: request.data,
        authUid: (_d = (_c = request.auth) === null || _c === void 0 ? void 0 : _c.uid) !== null && _d !== void 0 ? _d : null,
    });
    if (!request.auth) {
        console.error('[sendInvitationEmail] Unauthenticated call.');
        throw new https_1.HttpsError("unauthenticated", "Debes estar autenticado para enviar invitaciones.");
    }
    const data = request.data;
    if (!data.email || !data.inviterName) {
        console.error('[sendInvitationEmail] Datos incompletos', { data });
        throw new https_1.HttpsError("invalid-argument", "Faltan el email o el nombre del remitente.");
    }
    try {
        const { email, inviterName } = data;
        // TODO: Get the actual origin from the request if possible, or set as an environment variable.
        const registrationUrl = `https://studio-8033020115-912ac.web.app/login`;
        const { data: resendData, error } = await resend.emails.send({
            from: 'Gestor D&G <gestor@fiscalflow.mx>',
            to: [email],
            subject: `Invitación para unirte a Gestor D&G`,
            html: `
          <h1>¡Has sido invitado!</h1>
          <p>Hola,</p>
          <p>${inviterName} te ha invitado a unirte a su equipo en Gestor D&G, una herramienta para la gestión de tareas y proyectos.</p>
          <p>Para comenzar, por favor regístrate usando este correo electrónico en el siguiente enlace:</p>
          <p><a href="${registrationUrl}" style="background-color: #3f51b5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Crear mi cuenta</a></p>
          <p>Si el botón no funciona, copia y pega esta URL en tu navegador:</p>
          <p>${registrationUrl}</p>
          <p>¡Esperamos verte pronto!</p>
          <p>El equipo de Gestor D&G</p>
        `,
        });
        if (error) {
            console.error('[sendInvitationEmail] Error returned by Resend', { email, error });
            throw new https_1.HttpsError("internal", `Error sending email with Resend: ${error.message ?? 'no message'}`);
        }
        console.log('[sendInvitationEmail] Email sent successfully', { email, resendId: resendData === null || resendData === void 0 ? void 0 : resendData.id });
        return { success: true, id: resendData === null || resendData === void 0 ? void 0 : resendData.id };
    }
    catch (err) {
        console.error('[sendInvitationEmail] Exception while sending email', {
            error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: String(err) },
        });
        if (err instanceof https_1.HttpsError) {
            throw err;
        }
        throw new https_1.HttpsError("internal", err instanceof Error ? err.message : "Error desconocido al enviar correo de invitación.");
    }
});
//# sourceMappingURL=index.js.map

    