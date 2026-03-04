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

const buildUnlockAccountEmail = (user, unlockUrl) => {
  const displayName = user.name || 'bạn';
  const subject = '🔓 Mở khóa tài khoản Smart AI';
  
  const text = [
    `Xin chào ${displayName},`,
    '',
    'Tài khoản của bạn đã bị khóa tạm thời do đăng nhập sai quá nhiều lần.',
    '',
    'Nhấp vào liên kết dưới đây để mở khóa tài khoản:',
    unlockUrl,
    '',
    'Liên kết này có hiệu lực trong 1 giờ.',
    '',
    'Nếu bạn không yêu cầu mở khóa tài khoản, vui lòng bỏ qua email này.',
    'Tài khoản của bạn sẽ tự động được mở khóa sau 30 phút.',
    '',
    'Trân trọng,',
    'Smart AI Team'
  ].join('\n');

  const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Mở khóa tài khoản</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f7fa;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                    🔓 Mở khóa tài khoản
                  </h1>
                  <p style="margin: 10px 0 0; color: #fef3c7; font-size: 16px; font-weight: 300;">
                    Smart AI
                  </p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 50px 40px;">
                  <h2 style="margin: 0 0 20px; color: #2d3748; font-size: 28px; font-weight: 600;">
                    Xin chào ${displayName}! 👋
                  </h2>
                  
                  <div style="padding: 20px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; margin-bottom: 30px;">
                    <p style="margin: 0; color: #92400e; font-size: 15px; line-height: 1.6;">
                      ⚠️ <strong>Tài khoản của bạn đã bị khóa tạm thời</strong><br>
                      Lý do: Đăng nhập sai quá nhiều lần
                    </p>
                  </div>
                  
                  <p style="margin: 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.8;">
                    Để bảo vệ tài khoản của bạn, chúng tôi đã tạm thời khóa tài khoản này. 
                    Bạn có thể mở khóa ngay bằng cách nhấp vào nút bên dưới.
                  </p>
                  
                  <!-- CTA Button -->
                  <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
                    <tr>
                      <td align="center" style="padding: 20px 0;">
                        <a href="${unlockUrl}" 
                           style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 18px; border-radius: 8px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);">
                          🔓 Mở khóa tài khoản
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <div style="padding: 20px; background-color: #f0f9ff; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0 0 10px; color: #075985; font-size: 14px; font-weight: 600;">
                      💡 Lưu ý:
                    </p>
                    <ul style="margin: 0; padding-left: 20px; color: #0c4a6e; font-size: 14px; line-height: 1.8;">
                      <li>Liên kết có hiệu lực trong <strong>1 giờ</strong></li>
                      <li>Tài khoản sẽ tự động mở khóa sau <strong>30 phút</strong></li>
                      <li>Nếu bạn không yêu cầu, vui lòng bỏ qua email này</li>
                    </ul>
                  </div>
                  
                  <p style="margin: 20px 0 0; color: #718096; font-size: 14px; line-height: 1.6; padding: 15px; background-color: #f7fafc; border-radius: 6px;">
                    <strong>Không thể nhấp vào nút?</strong><br>
                    Sao chép và dán liên kết sau vào trình duyệt:<br>
                    <a href="${unlockUrl}" style="color: #3182ce; word-break: break-all;">${unlockUrl}</a>
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 30px; background-color: #f7fafc; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px; color: #718096; font-size: 14px;">
                    Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi
                  </p>
                  <p style="margin: 0 0 20px; color: #4a5568; font-size: 14px;">
                    📧 ${process.env.SMTP_USER || 'support@smartai.com'} | 📱 1900-xxxx
                  </p>
                  <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                    © 2026 Smart AI. All rights reserved.
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

const sendUnlockAccountEmail = async (user, unlockUrl) => {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { subject, text, html } = buildUnlockAccountEmail(user, unlockUrl);

  return transporter.sendMail({
    from,
    to: user.email,
    subject,
    text,
    html
  });
};

const buildOrderConfirmationEmail = (user, order) => {
  const displayName = user.name || order.shippingAddress.fullName || 'Quý khách';
  const subject = `✅ Đơn hàng #${order.orderNumber} đã được tiếp nhận`;
  
  // Format currency
  const formatCurrency = (amount) => {
    return amount.toLocaleString('vi-VN') + 'đ';
  };

  // Format date
  const formatDate = (date) => {
    return new Date(date).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Build items HTML
  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding: 15px; border-bottom: 1px solid #e2e8f0;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 60px; vertical-align: top;">
              ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;">` : ''}
            </td>
            <td style="padding-left: 15px; vertical-align: top;">
              <p style="margin: 0 0 5px; color: #2d3748; font-weight: 600; font-size: 15px;">
                ${item.name}
              </p>
              <p style="margin: 0; color: #718096; font-size: 13px;">
                Màu: ${item.color} | Số lượng: ${item.quantity}
              </p>
            </td>
            <td style="text-align: right; vertical-align: top; white-space: nowrap;">
              <p style="margin: 0; color: #2d3748; font-weight: 600; font-size: 15px;">
                ${formatCurrency(item.price * item.quantity)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const text = [
    `Xin chào ${displayName},`,
    '',
    `Cảm ơn bạn đã đặt hàng tại Smart AI!`,
    '',
    `Mã đơn hàng: ${order.orderNumber}`,
    `Tổng tiền: ${formatCurrency(order.total)}`,
    '',
    `Chúng tôi sẽ xử lý đơn hàng của bạn trong thời gian sớm nhất.`,
    `Bạn có thể theo dõi trạng thái đơn hàng trong tài khoản của mình.`,
    '',
    'Cảm ơn bạn đã tin tưởng Smart AI!',
    '',
    'Smart AI Team'
  ].join('\n');

  const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Đơn hàng đã được tiếp nhận</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f7fa;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                  <div style="background-color: rgba(255,255,255,0.2); width: 80px; height: 80px; margin: 0 auto 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 40px;">✅</span>
                  </div>
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                    Cảm ơn bạn đã đặt hàng!
                  </h1>
                  <p style="margin: 10px 0 0; color: #d1fae5; font-size: 16px;">
                    Đơn hàng #${order.orderNumber}
                  </p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <p style="margin: 0 0 25px; color: #2d3748; font-size: 16px; line-height: 1.6;">
                    Xin chào <strong>${displayName}</strong>,
                  </p>
                  
                  <p style="margin: 0 0 25px; color: #4a5568; font-size: 15px; line-height: 1.8;">
                    Cảm ơn bạn đã tin tưởng và đặt hàng tại <strong style="color: #10b981;">Smart AI</strong>! 
                    Đơn hàng của bạn đã được tiếp nhận và đang được xử lý.
                  </p>
                  
                  <!-- Order Info -->
                  <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 30px; background-color: #f7fafc; border-radius: 8px; overflow: hidden;">
                    <tr>
                      <td style="padding: 20px;">
                        <table role="presentation" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 8px 0;">
                              <span style="color: #718096; font-size: 14px;">Mã đơn hàng:</span>
                            </td>
                            <td style="text-align: right; padding: 8px 0;">
                              <strong style="color: #2d3748; font-size: 14px;">#${order.orderNumber}</strong>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0;">
                              <span style="color: #718096; font-size: 14px;">Ngày đặt:</span>
                            </td>
                            <td style="text-align: right; padding: 8px 0;">
                              <strong style="color: #2d3748; font-size: 14px;">${formatDate(order.createdAt)}</strong>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Shipping Address -->
                  <div style="margin-bottom: 30px; padding: 20px; background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px;">
                    <h3 style="margin: 0 0 15px; color: #92400e; font-size: 16px; font-weight: 600;">
                      📦 Địa chỉ giao hàng
                    </h3>
                    <p style="margin: 0 0 5px; color: #78350f; font-size: 14px; line-height: 1.6;">
                      <strong>${order.shippingAddress.fullName}</strong> - ${order.shippingAddress.phone}
                    </p>
                    <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
                      ${order.shippingAddress.address}, ${order.shippingAddress.ward}, ${order.shippingAddress.district}, ${order.shippingAddress.city}
                    </p>
                  </div>
                  
                  <!-- Order Items -->
                  <h3 style="margin: 0 0 15px; color: #2d3748; font-size: 18px; font-weight: 600;">
                    Chi tiết đơn hàng
                  </h3>
                  
                  <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    ${itemsHtml}
                  </table>
                  
                  <!-- Order Summary -->
                  <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                    <tr>
                      <td style="padding: 8px 0; border-top: 1px solid #e2e8f0;">
                        <span style="color: #4a5568; font-size: 14px;">Tạm tính:</span>
                      </td>
                      <td style="text-align: right; padding: 8px 0; border-top: 1px solid #e2e8f0;">
                        <span style="color: #2d3748; font-size: 14px;">${formatCurrency(order.subtotal)}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0;">
                        <span style="color: #4a5568; font-size: 14px;">Phí vận chuyển:</span>
                      </td>
                      <td style="text-align: right; padding: 8px 0;">
                        <span style="color: #2d3748; font-size: 14px;">${formatCurrency(order.shippingFee)}</span>
                      </td>
                    </tr>
                    ${order.promotion ? `
                    <tr>
                      <td style="padding: 8px 0;">
                        <span style="color: #10b981; font-size: 14px;">Giảm giá (${order.promotion.code}):</span>
                      </td>
                      <td style="text-align: right; padding: 8px 0;">
                        <span style="color: #10b981; font-size: 14px;">-${formatCurrency(order.promotion.discountAmount)}</span>
                      </td>
                    </tr>
                    ` : ''}
                    <tr>
                      <td style="padding: 15px 0 0; border-top: 2px solid #2d3748;">
                        <strong style="color: #2d3748; font-size: 18px;">Tổng cộng:</strong>
                      </td>
                      <td style="text-align: right; padding: 15px 0 0; border-top: 2px solid #2d3748;">
                        <strong style="color: #10b981; font-size: 20px;">${formatCurrency(order.total)}</strong>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- CTA -->
                  <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                    <tr>
                      <td align="center" style="padding: 20px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/orders/${order._id}" 
                           style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                          Theo dõi đơn hàng
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <div style="padding: 20px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 1.6;">
                      💚 Cảm ơn bạn đã tin tưởng Smart AI!<br>
                      Chúng tôi sẽ giao hàng đến bạn trong thời gian sớm nhất.
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 30px; background-color: #f7fafc; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px; color: #718096; font-size: 14px;">
                    Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi
                  </p>
                  <p style="margin: 0 0 20px; color: #4a5568; font-size: 14px;">
                    📧 ${process.env.SMTP_USER || 'support@smartai.com'} | 📱 1900-xxxx
                  </p>
                  <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                    © 2026 Smart AI. All rights reserved.
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

const sendOrderConfirmationEmail = async (user, order) => {
  const transporter = getTransporter();
  const { subject, text, html } = buildOrderConfirmationEmail(user, order);

  await transporter.sendMail({
    from: `"Smart AI" <${process.env.SMTP_USER}>`,
    to: user.email,
    subject,
    text,
    html
  });
};

module.exports = {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendUnlockAccountEmail,
  sendOrderConfirmationEmail
};
