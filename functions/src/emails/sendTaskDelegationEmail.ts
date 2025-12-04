// functions/src/emails/sendTaskDelegationEmail.ts
import { Resend } from 'resend';

// IMPORTANT: Replace this placeholder with your actual Resend API Key.
const RESEND_API_KEY = '[REMOVED_RESEND_API_KEY]';

if (!RESEND_API_KEY || RESEND_API_KEY === 'REPLACE_WITH_YOUR_RESEND_API_KEY') {
  // This helps detect if you forgot to set the actual key.
  console.error('[sendTaskDelegationEmail] RESEND_API_KEY is not configured correctly.');
}

const resend = new Resend(RESEND_API_KEY);

export interface TaskDelegationEmailPayload {
  to: string;                // Delegate's email
  taskId: string;
  taskTitle: string;
  delegatorName: string;
  delegateName: string;
  taskUrl?: string;          // Optional, link to the task
}

export async function sendTaskDelegationEmail(
  payload: TaskDelegationEmailPayload
): Promise<{ id?: string }> {
  const { to, taskId, taskTitle, delegatorName, delegateName, taskUrl } = payload;

  console.log('[sendTaskDelegationEmail] Preparing to send email', {
    to,
    taskId,
    taskTitle,
    delegatorName,
    delegateName,
    hasTaskUrl: !!taskUrl,
  });

  try {
    const { data, error } = await resend.emails.send({
      // IMPORTANT: Change this to your verified domain in Resend
      from: 'Gestor D&G <onboarding@resend.dev>',
      to: [to],
      subject: `Nueva tarea delegada: ${taskTitle}`,
      html: `
        <h1>Se te ha delegado una nueva tarea</h1>
        <p>Hola ${delegateName},</p>
        <p>${delegatorName} te ha delegado la tarea:</p>
        <p><strong>${taskTitle}</strong> (ID: ${taskId})</p>
        ${
          taskUrl
            ? `<p>Puedes revisar los detalles aquí: <a href="${taskUrl}">${taskUrl}</a></p>`
            : ''
        }
        <p>Por favor, revisa la tarea en el sistema.</p>
      `,
    });

    if (error) {
      console.error('[sendTaskDelegationEmail] Error returned by Resend', {
        to,
        taskId,
        error,
      });
      throw new Error(`Error sending email with Resend: ${error.message ?? 'no message'}`);
    }

    console.log('[sendTaskDelegationEmail] Email sent successfully', {
      to,
      taskId,
      resendId: data?.id,
    });

    return { id: data?.id };
  } catch (err) {
    console.error('[sendTaskDelegationEmail] Exception while sending email', {
      to,
      taskId,
      error:
        err instanceof Error
          ? { message: err.message, stack: err.stack }
          : { value: String(err) },
    });
    // Re-throw the error so the calling function can handle it
    throw err;
  }
}
