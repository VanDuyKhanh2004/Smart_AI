const nodemailer = require('nodemailer');

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true';

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration is missing');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
};

const buildWelcomeEmail = (user) => {
  const displayName = user.name || 'ban';
  const subject = 'Chao mung ban den voi Smart AI';
  const text = [
    `Xin chao ${displayName},`,
    '',
    'Cam on ban da dang nhap lan dau vao Smart AI.',
    'Chuc ban co trai nghiem tuyet voi!',
    '',
    'Smart AI Team'
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Xin chao ${displayName},</h2>
      <p>Cam on ban da dang nhap lan dau vao <strong>Smart AI</strong>.</p>
      <p>Chuc ban co trai nghiem tuyet voi!</p>
      <p>Smart AI Team</p>
    </div>
  `;

  return { subject, text, html };
};

const buildVerificationEmail = (user, verifyUrl) => {
  const displayName = user.name || 'ban';
  const subject = 'Xac nhan email cua ban';
  const text = [
    `Xin chao ${displayName},`,
    '',
    'Vui long xac nhan email de kich hoat tai khoan Smart AI.',
    `Link xac nhan: ${verifyUrl}`,
    '',
    'Neu ban khong dang ky tai khoan, hay bo qua email nay.',
    '',
    'Smart AI Team'
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Xin chao ${displayName},</h2>
      <p>Vui long xac nhan email de kich hoat tai khoan <strong>Smart AI</strong>.</p>
      <p><a href="${verifyUrl}">Xac nhan email</a></p>
      <p>Neu ban khong dang ky tai khoan, hay bo qua email nay.</p>
      <p>Smart AI Team</p>
    </div>
  `;

  return { subject, text, html };
};

const sendWelcomeEmail = async (user) => {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { subject, text, html } = buildWelcomeEmail(user);

  return transporter.sendMail({
    from,
    to: user.email,
    subject,
    text,
    html
  });
};

const sendVerificationEmail = async (user, verifyUrl) => {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { subject, text, html } = buildVerificationEmail(user, verifyUrl);

  return transporter.sendMail({
    from,
    to: user.email,
    subject,
    text,
    html
  });
};

module.exports = {
  sendWelcomeEmail,
  sendVerificationEmail
};
