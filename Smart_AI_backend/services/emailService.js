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
  const displayName = user.name || 'bạn';
  const subject = '🎉 Chào mừng bạn đến với Smart AI';
  const text = [
    `Xin chào ${displayName},`,
    '',
    'Cảm ơn bạn đã đăng nhập lần đầu vào Smart AI.',
    'Chúc bạn có trải nghiệm tuyệt vời!',
    '',
    'Smart AI Team'
  ].join('\n');

  const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Chào mừng đến với Smart AI</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f7fa;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                    🤖 Smart AI
                  </h1>
                  <p style="margin: 10px 0 0; color: #e8eaf6; font-size: 16px; font-weight: 300;">
                    Trợ lý AI thông minh của bạn
                  </p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 50px 40px;">
                  <h2 style="margin: 0 0 20px; color: #2d3748; font-size: 28px; font-weight: 600;">
                    Xin chào ${displayName}! 👋
                  </h2>
                  
                  <p style="margin: 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.8;">
                    Chúng tôi rất vui mừng chào đón bạn đến với <strong style="color: #667eea;">Smart AI</strong>! 
                    Cảm ơn bạn đã tin tưởng và chọn chúng tôi.
                  </p>
                  
                  <p style="margin: 0 0 30px; color: #4a5568; font-size: 16px; line-height: 1.8;">
                    Với Smart AI, bạn có thể:
                  </p>
                  
                  <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                    <tr>
                      <td style="padding: 15px; background-color: #f7fafc; border-left: 4px solid #667eea; margin-bottom: 10px;">
                        <p style="margin: 0; color: #2d3748; font-size: 15px;">
                          <strong>🛍️ Mua sắm thông minh</strong><br>
                          <span style="color: #718096;">Tìm kiếm và so sánh sản phẩm dễ dàng</span>
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 15px; background-color: #f7fafc; border-left: 4px solid #764ba2; margin-bottom: 10px;">
                        <p style="margin: 0; color: #2d3748; font-size: 15px;">
                          <strong>💬 Trò chuyện với AI</strong><br>
                          <span style="color: #718096;">Nhận tư vấn và hỗ trợ 24/7</span>
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 15px; background-color: #f7fafc; border-left: 4px solid #667eea;">
                        <p style="margin: 0; color: #2d3748; font-size: 15px;">
                          <strong>⭐ Đánh giá & Chia sẻ</strong><br>
                          <span style="color: #718096;">Tham gia cộng đồng người dùng</span>
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin: 0 0 30px; color: #4a5568; font-size: 16px; line-height: 1.8;">
                    Hãy bắt đầu khám phá và tận hưởng trải nghiệm tuyệt vời cùng chúng tôi! 🚀
                  </p>
                  
                  <table role="presentation" style="margin: 0 auto;">
                    <tr>
                      <td style="border-radius: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" 
                           style="display: inline-block; padding: 14px 40px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                          Bắt đầu ngay
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 30px 40px; background-color: #f7fafc; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px; color: #718096; font-size: 14px; line-height: 1.6; text-align: center;">
                    Trân trọng,<br>
                    <strong style="color: #2d3748;">Đội ngũ Smart AI</strong>
                  </p>
                  
                  <p style="margin: 20px 0 0; color: #a0aec0; font-size: 12px; line-height: 1.6; text-align: center;">
                    © ${new Date().getFullYear()} Smart AI. All rights reserved.<br>
                    Email này được gửi tự động, vui lòng không trả lời.
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return { subject, text, html };
};

const buildVerificationEmail = (user, verifyUrl) => {
  const displayName = user.name || 'bạn';
  const subject = '✉️ Xác nhận email của bạn - Smart AI';
  const text = [
    `Xin chào ${displayName},`,
    '',
    'Vui lòng xác nhận email để kích hoạt tài khoản Smart AI.',
    `Link xác nhận: ${verifyUrl}`,
    '',
    'Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này.',
    '',
    'Smart AI Team'
  ].join('\n');

  const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Xác nhận email</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f7fa;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                    🤖 Smart AI
                  </h1>
                  <p style="margin: 10px 0 0; color: #e8eaf6; font-size: 16px; font-weight: 300;">
                    Xác nhận tài khoản của bạn
                  </p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 50px 40px;">
                  <h2 style="margin: 0 0 20px; color: #2d3748; font-size: 28px; font-weight: 600;">
                    Xin chào ${displayName}! 👋
                  </h2>
                  
                  <p style="margin: 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.8;">
                    Cảm ơn bạn đã đăng ký tài khoản <strong style="color: #667eea;">Smart AI</strong>!
                  </p>
                  
                  <p style="margin: 0 0 30px; color: #4a5568; font-size: 16px; line-height: 1.8;">
                    Để hoàn tất quá trình đăng ký và kích hoạt tài khoản của bạn, vui lòng nhấn vào nút bên dưới:
                  </p>
                  
                  <table role="presentation" style="margin: 0 auto 30px;">
                    <tr>
                      <td style="border-radius: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                        <a href="${verifyUrl}" 
                           style="display: inline-block; padding: 14px 40px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                          ✓ Xác nhận email
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin: 0 0 15px; color: #718096; font-size: 14px; line-height: 1.6;">
                    Hoặc copy link sau vào trình duyệt:
                  </p>
                  <p style="margin: 0 0 30px; padding: 15px; background-color: #f7fafc; border-radius: 6px; word-break: break-all;">
                    <a href="${verifyUrl}" style="color: #667eea; text-decoration: none; font-size: 14px;">${verifyUrl}</a>
                  </p>
                  
                  <table role="presentation" style="width: 100%; background-color: #fff5f5; border-left: 4px solid #fc8181; padding: 15px; border-radius: 6px;">
                    <tr>
                      <td>
                        <p style="margin: 0; color: #c53030; font-size: 14px; line-height: 1.6;">
                          <strong>⚠️ Lưu ý:</strong> Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 30px 40px; background-color: #f7fafc; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px; color: #718096; font-size: 14px; line-height: 1.6; text-align: center;">
                    Trân trọng,<br>
                    <strong style="color: #2d3748;">Đội ngũ Smart AI</strong>
                  </p>
                  
                  <p style="margin: 20px 0 0; color: #a0aec0; font-size: 12px; line-height: 1.6; text-align: center;">
                    © ${new Date().getFullYear()} Smart AI. All rights reserved.<br>
                    Email này được gửi tự động, vui lòng không trả lời.
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return { subject, text, html };
};

const buildPasswordResetEmail = (user, resetUrl) => {
  const displayName = user.name || 'bạn';
  const subject = '🔒 Đặt lại mật khẩu - Smart AI';
  const text = [
    `Xin chào ${displayName},`,
    '',
    'Bạn đã yêu cầu đặt lại mật khẩu Smart AI.',
    `Link đặt lại mật khẩu: ${resetUrl}`,
    'Link này chỉ có hiệu lực trong thời gian ngắn.',
    '',
    'Nếu bạn không yêu cầu, hãy bỏ qua email này.',
    '',
    'Smart AI Team'
  ].join('\n');

  const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Đặt lại mật khẩu</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f7fa;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                    🤖 Smart AI
                  </h1>
                  <p style="margin: 10px 0 0; color: #e8eaf6; font-size: 16px; font-weight: 300;">
                    Đặt lại mật khẩu của bạn
                  </p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 50px 40px;">
                  <h2 style="margin: 0 0 20px; color: #2d3748; font-size: 28px; font-weight: 600;">
                    Xin chào ${displayName}! 👋
                  </h2>
                  
                  <p style="margin: 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.8;">
                    Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong style="color: #667eea;">Smart AI</strong> của bạn.
                  </p>
                  
                  <p style="margin: 0 0 30px; color: #4a5568; font-size: 16px; line-height: 1.8;">
                    Để đặt lại mật khẩu, vui lòng nhấn vào nút bên dưới:
                  </p>
                  
                  <table role="presentation" style="margin: 0 auto 30px;">
                    <tr>
                      <td style="border-radius: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                        <a href="${resetUrl}" 
                           style="display: inline-block; padding: 14px 40px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                          🔑 Đặt lại mật khẩu
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin: 0 0 15px; color: #718096; font-size: 14px; line-height: 1.6;">
                    Hoặc copy link sau vào trình duyệt:
                  </p>
                  <p style="margin: 0 0 30px; padding: 15px; background-color: #f7fafc; border-radius: 6px; word-break: break-all;">
                    <a href="${resetUrl}" style="color: #667eea; text-decoration: none; font-size: 14px;">${resetUrl}</a>
                  </p>
                  
                  <table role="presentation" style="width: 100%; background-color: #fffaf0; border-left: 4px solid #ed8936; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                    <tr>
                      <td>
                        <p style="margin: 0; color: #c05621; font-size: 14px; line-height: 1.6;">
                          <strong>⏰ Lưu ý:</strong> Link này chỉ có hiệu lực trong thời gian ngắn. Vui lòng đặt lại mật khẩu sớm.
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <table role="presentation" style="width: 100%; background-color: #fff5f5; border-left: 4px solid #fc8181; padding: 15px; border-radius: 6px;">
                    <tr>
                      <td>
                        <p style="margin: 0; color: #c53030; font-size: 14px; line-height: 1.6;">
                          <strong>⚠️ Bảo mật:</strong> Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này và tài khoản của bạn sẽ vẫn được bảo mật.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 30px 40px; background-color: #f7fafc; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px; color: #718096; font-size: 14px; line-height: 1.6; text-align: center;">
                    Trân trọng,<br>
                    <strong style="color: #2d3748;">Đội ngũ Smart AI</strong>
                  </p>
                  
                  <p style="margin: 20px 0 0; color: #a0aec0; font-size: 12px; line-height: 1.6; text-align: center;">
                    © ${new Date().getFullYear()} Smart AI. All rights reserved.<br>
                    Email này được gửi tự động, vui lòng không trả lời.
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
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

const sendPasswordResetEmail = async (user, resetUrl) => {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { subject, text, html } = buildPasswordResetEmail(user, resetUrl);

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
  sendVerificationEmail,
  sendPasswordResetEmail
};
