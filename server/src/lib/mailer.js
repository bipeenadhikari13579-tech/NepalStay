import nodemailer from 'nodemailer'

const { SMTP_USER, SMTP_PASS } = process.env

export const mailConfigured = Boolean(SMTP_USER && SMTP_PASS)

const transporter = mailConfigured
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS.replace(/\s/g, '') },
    })
  : null

if (!mailConfigured) {
  console.warn(
    'Email is not configured (SMTP_USER / SMTP_PASS in .env). Verification codes will be printed here instead.',
  )
}

// Wording for each kind of code email.
const PURPOSES = {
  signup: {
    label: 'Verification',
    what: 'verification code',
    why: 'Use this code to verify your email for Nepal Stay:',
    ignore: 'If you did not sign up, you can ignore this email.',
  },
  admin: {
    label: 'Admin login',
    what: 'admin login code',
    why: 'Use this code to finish logging in to the Nepal Stay admin portal:',
    ignore: 'If you did not try to log in, someone knows the admin password. Change it now.',
  },
  reset: {
    label: 'Password reset',
    what: 'password reset code',
    why: 'Use this code to choose a new password for your Nepal Stay account:',
    ignore: 'If you did not ask to reset your password, you can ignore this email. Your password has not changed.',
  },
}

/**
 * Sends a 6-digit code. Without SMTP settings it prints the code to this terminal
 * so the flow still works during development.
 * Returns 'email' or 'console'.
 */
export async function sendVerificationCode({ to, name, code, minutes, purpose = 'signup' }) {
  const { label, what, why, ignore } = PURPOSES[purpose] ?? PURPOSES.signup
  if (!mailConfigured) {
    console.log(`\n[dev] ${label} code for ${to}: ${code}\n`)
    return 'console'
  }

  const safeName = String(name).replace(/[<>&"]/g, '')
  await transporter.sendMail({
    from: `"Nepal Stay" <${SMTP_USER}>`,
    to,
    subject: `${code} is your Nepal Stay ${what}`,
    text: `Namaste ${name},\n\nYour Nepal Stay ${what} is ${code}.\nIt expires in ${minutes} minutes.\n\n${ignore}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#141a33">
        <h2 style="margin:0 0 12px">Namaste ${safeName},</h2>
        <p style="margin:0 0 16px">${why}</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 16px;color:#c91f37">${code}</p>
        <p style="margin:0 0 16px">It expires in ${minutes} minutes.</p>
        <p style="margin:0;color:#5d6478;font-size:13px">${ignore}</p>
      </div>`,
  })
  return 'email'
}
