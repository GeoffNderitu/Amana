// Single extension point for outbound transactional email. Amana ships with no SMTP
// dependency baked in (keeps the "single deployable service" story simple, and avoids
// pulling in a mail provider SDK nobody's configured yet). In development — or any
// deploy where no mail provider is configured — the reset link is written to the server
// log instead of actually emailed, so the whole flow is runnable and testable end to end
// with zero external setup.
//
// To wire up real delivery: implement the body of `sendPasswordResetEmail` using
// whichever provider you like (SMTP via nodemailer, Postmark, SES, Resend, etc.) and gate
// it behind whatever env vars you add — nothing else in the auth routes needs to change.

const IS_PROD = process.env.NODE_ENV === 'production';

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  // Real provider integration goes here. Example shape, left commented out so this file
  // has zero required dependencies out of the box:
  //
  // if (process.env.SMTP_HOST) {
  //   const nodemailer = await import('nodemailer');
  //   const transport = nodemailer.createTransport({
  //     host: process.env.SMTP_HOST,
  //     port: Number(process.env.SMTP_PORT || 587),
  //     auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  //   });
  //   await transport.sendMail({
  //     from: process.env.SMTP_FROM || 'Amana <no-reply@amana.app>',
  //     to: email,
  //     subject: 'Reset your Amana password',
  //     text: `Reset your password: ${resetUrl}\n\nThis link expires in 30 minutes. If you didn't request this, you can ignore it.`,
  //   });
  //   return;
  // }

  console.log(`[Amana] Password reset requested for ${email}. Link (expires in 30 min): ${resetUrl}`);
  if (IS_PROD) {
    console.warn(
      '[Amana] No email provider is configured (see server/src/mailer.ts) — the reset link above was only logged, not emailed. Configure one before relying on this in production.'
    );
  }
}
