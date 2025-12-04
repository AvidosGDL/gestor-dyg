
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {Resend} from "resend";

admin.initializeApp();

// Define el secret en tu proyecto de Firebase:
// firebase functions:secrets:set RESEND_KEY
// Luego, en el panel de GCP, otorga acceso al secret
// a tu cuenta de servicio de Cloud Functions.
export const sendTaskDelegationEmail = functions.runWith({secrets: ["RESEND_KEY"]})
  .https.onCall(async (data, context) => {
    // Inicializa Resend dentro de la función donde los secrets están disponibles.
    const resendApiKey = process.env.RESEND_KEY;
    if (!resendApiKey) {
      console.error("La clave de API de Resend (RESEND_KEY) no está configurada.");
      throw new functions.https.HttpsError(
        "internal",
        "El servicio de correo no está configurado.",
      );
    }
    const resend = new Resend(resendApiKey);

    // 1. Verifica la autenticación del usuario que llama.
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "La función debe ser llamada por un usuario autenticado.",
      );
    }

    const {delegatedToEmail, delegatedToName, taskTitle, delegatedByName} = data;

    // 2. Valida los datos de entrada.
    if (!delegatedToEmail || !taskTitle || !delegatedByName || !delegatedToName) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Faltan datos requeridos para enviar la notificación (correo, título, etc.).",
      );
    }

    try {
      // 3. Prepara el contenido del correo.
      const subject = `Nueva tarea delegada: ${taskTitle}`;
      const body = `Hola ${delegatedToName},<br><br>${delegatedByName} te ha delegado una nueva tarea: <strong>${taskTitle}</strong>.<br><br>Puedes verla en tu tablero de TaskMaster Pro.`;

      // 4. Envía el correo usando Resend.
      const {error} = await resend.emails.send({
        from: "TaskMaster Pro <noreply@yourdomain.com>", // ¡IMPORTANTE! Cambia esto a tu dominio verificado en Resend.
        to: [delegatedToEmail],
        subject: subject,
        html: body,
      });

      if (error) {
        console.error("Resend API Error:", error);
        throw new functions.https.HttpsError(
          "internal",
          "Error al enviar el correo a través de Resend: " + error.message,
        );
      }

      return {success: true, message: `Correo de delegación enviado a ${delegatedToEmail}`};
    } catch (error) {
      console.error("Error en la Cloud Function sendTaskDelegationEmail:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Ocurrió un error inesperado al procesar el envío del correo.",
      );
    }
  });
