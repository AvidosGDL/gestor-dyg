/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentwritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Resend } from "resend";

admin.initializeApp();

exports.sendTaskDelegationEmail = onCall(async (request) => {
  // Initialize Resend with the provided API key.
  const resend = new Resend('[REMOVED_RESEND_API_KEY]');

  // 1. Verify authentication
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called by an authenticated user."
    );
  }

  const {
    delegatedToName,
    delegatedToEmail,
    taskTitle,
    delegatedByName,
  } = request.data;

  // 2. Validate input data
  if (
    !delegatedToName ||
    !delegatedToEmail ||
    !taskTitle ||
    !delegatedByName
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Required data is missing for sending the email."
    );
  }

  try {
    // 3. Define email content
    const subject = `Nueva tarea asignada: ${taskTitle}`;
    const body = `Hola ${delegatedToName},<br><br>
        ${delegatedByName} te ha asignado una nueva tarea: <strong>${taskTitle}</strong>.<br><br>
        Puedes ver los detalles en el tablero de Gestor D&G.<br><br>
        ¡Que tengas un día productivo!`;

    // 4. Send the email using Resend
    const { error } = await resend.emails.send({
      // IMPORTANT: Change this to your verified domain in Resend
      from: "Gestor D&G <onboarding@resend.dev>",
      to: [delegatedToEmail],
      subject: subject,
      html: body,
    });

    if (error) {
      console.error("Resend API Error:", error);
      throw new HttpsError(
        "internal",
        "Error sending email via Resend: " + error.message
      );
    }

    return { success: true, message: `Email sent to ${delegatedToEmail}` };
  } catch (error: any) {
    console.error("Error in sendTaskDelegationEmail function:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      "internal",
      "An unexpected error occurred while sending the email.",
      error.message
    );
  }
});
