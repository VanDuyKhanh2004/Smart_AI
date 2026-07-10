const User = require('../models/User');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken 
} = require('../utils/jwt');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const { fireAndForget, sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

// Validate required environment variables for Google Login
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
  console.error('GOOGLE_CLIENT_ID chưa được cấu hình trong biến môi trường');
}
if (!JWT_SECRET || JWT_SECRET === 'YOUR_JWT_SECRET') {
  console.error('JWT_SECRET chưa được cấu hình trong biến môi trường');
}
if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET === 'YOUR_REFRESH_SECRET') {
  console.error('JWT_REFRESH_SECRET chưa được cấu hình trong biến môi trường');
}

const client = GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID'
  ? new OAuth2Client(GOOGLE_CLIENT_ID)
  : null;

const createEmailVerificationToken = (user) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  user.emailVerificationToken = hashedToken;
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;

  return rawToken;
};

const buildVerifyUrl = (token, email) => {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
  return `${baseUrl}/verify-email?token=${token}${emailParam}`;
};

const createPasswordResetToken = (user) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = Date.now() + 60 * 60 * 1000;

  return rawToken;
};

const buildResetPasswordUrl = (token, email) => {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
  return `${baseUrl}/reset-password?token=${token}${emailParam}`;
};

/**
 * @desc    Register new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'EMAIL_EXISTS',
          message: 'Email đã được đăng ký'
        }
      });
    }

    // Create new user
    const user = await User.create({
      name,
      email,
      password
    });

    const verificationToken = createEmailVerificationToken(user);

    await user.save({ validateBeforeSave: false });

    const verifyUrl = buildVerifyUrl(verificationToken, user.email);
    fireAndForget(sendVerificationEmail(user, verifyUrl), "Verification email failed");

    res.status(201).json({
      success: true,
      message: 'Vui long xac nhan email de kich hoat tai khoan',
      data: {
        user: user.toJSON()
      }
    });
  } catch (error) {
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {

      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
          details: errors
        }
      });
    }

    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server'
      }
    });
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const maxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email và mật khẩu là bắt buộc'
        }
      });
    }

    // Find user with password
    const user = await User.findByEmailWithPassword(email.toLowerCase());
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email hoặc mật khẩu không đúng'
        }
      });
    }

    if (user.isLocked) {
      const retryAfter = Math.ceil((new Date(user.lockUntil).getTime() - Date.now()) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfter, 1)));
      return res.status(429).json({
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Tai khoan tam thoi bi khoa do dang nhap sai nhieu lan. Vui long thu lai sau.'
        }
      });
    }

    // Google-only account cannot use email/password login
    if (!user.password) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'GOOGLE_LOGIN_REQUIRED',
          message: 'Tài khoản này sử dụng Google để đăng nhập. Vui lòng đăng nhập bằng Google.'
        }
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementLoginAttempts({ maxAttempts });
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email hoặc mật khẩu không đúng'
        }
      });
    }

    if (!user.emailVerified && !user.googleId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Vui long xac nhan email truoc khi dang nhap'
        }
      });
    }

    if (user.loginAttempts || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    if (!user.welcomeEmailSent && (user.emailVerified || user.googleId)) {
      fireAndForget(sendWelcomeEmail(user), "Welcome email failed");
      user.welcomeEmailSent = true;
      user.firstLoginAt = new Date();
      await user.save({ validateBeforeSave: false });
    }

    res.status(200).json({
      success: true,
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server'
      }
    });
  }
};

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = async (req, res) => {
  try {
    // Clear refresh token from database
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });

    res.status(200).json({
      success: true,
      message: 'Đăng xuất thành công'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server'
      }
    });
  }
};

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh
 * @access  Public
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Refresh token là bắt buộc'
        }
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'REFRESH_TOKEN_INVALID',
          message: 'Refresh token không hợp lệ hoặc đã hết hạn'
        }
      });
    }

    // Find user and check if refresh token matches
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'REFRESH_TOKEN_INVALID',
          message: 'Refresh token không hợp lệ'
        }
      });
    }

    // Generate new access token
    const accessToken = generateAccessToken(user);

    res.status(200).json({
      success: true,
      data: {
        accessToken
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server'
      }
    });
  }
};

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Không tìm thấy người dùng'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: user.toJSON()
      }
    });
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Lỗi server'
      }
    });
  }
};

/**
 * @desc    Login with Google
 * @route   POST /api/auth/google-login
 * @access  Public
 */
const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    // Validate input
    if (!credential) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Google credential là bắt buộc'
        }
      });
    }

    // Kiểm tra biến môi trường
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'GOOGLE_CLIENT_ID chưa được cấu hình trên server'
        }
      });
    }
    if (!client) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Google OAuth2Client chưa được khởi tạo do thiếu GOOGLE_CLIENT_ID'
        }
      });
    }

    // Verify Google ID Token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture, email_verified } = payload;

    // Kiểm tra email_verified từ Google
    if (!email_verified) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'GOOGLE_EMAIL_NOT_VERIFIED',
          message: 'Email Google chưa được xác minh'
        }
      });
    }

    // Kiểm tra email
    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Không thể lấy email từ tài khoản Google'
        }
      });
    }

    // Look up user by googleId only — do NOT auto-link by email
    let user = await User.findOne({ googleId }).select('+password');

    if (!user) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'GOOGLE_ACCOUNT_NOT_LINKED',
            message: 'Email này đã thuộc về một tài khoản hiện có. Vui lòng đăng nhập bằng email và mật khẩu, sau đó vào trang hồ sơ để liên kết Google.'
          }
        });
      }

      user = await User.create({
        name: name || email.split('@')[0],
        email,
        googleId,
        avatar: picture || null,
        emailVerified: true
      });
    }

    // Auto-verify email for Google users
    if (!user.emailVerified) {
      user.emailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save({ validateBeforeSave: false });
    }

    // Generate tokens
    if (!JWT_SECRET || JWT_SECRET === 'YOUR_JWT_SECRET') {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'JWT_SECRET chưa được cấu hình trên server'
        }
      });
    }
    if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET === 'YOUR_REFRESH_SECRET') {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'JWT_REFRESH_SECRET chưa được cấu hình trên server'
        }
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    // Send welcome email if first time
    if (!user.welcomeEmailSent) {
      fireAndForget(sendWelcomeEmail(user), "Welcome email failed");
      user.welcomeEmailSent = true;
      user.firstLoginAt = new Date();
      await user.save({ validateBeforeSave: false });
    }

    res.status(200).json({
      success: true,
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error(error);
    
    if (error.message && error.message.includes('Token')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Google token không hợp lệ hoặc đã hết hạn'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

/**
 * @desc    Link Google account to currently authenticated user
 * @route   POST /api/auth/link/google
 * @access  Private
 */
const linkGoogle = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Google credential là bắt buộc' }
      });
    }

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, picture } = payload;

    // Ensure no other user already linked this Google account
    const existing = await User.findOne({ googleId });
    if (existing && existing._id.toString() !== req.user._id.toString()) {
      return res.status(409).json({
        success: false,
        error: { code: 'GOOGLE_LINKED', message: 'Google account đã được liên kết với người dùng khác' }
      });
    }

    // Require that google email matches current user's email for safety
    if (email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: { code: 'EMAIL_MISMATCH', message: 'Email Google không khớp với email tài khoản hiện tại' }
      });
    }

    // Link and save
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Người dùng không tồn tại' } });
    }

    // Already linked — check if same Google account
    if (user.googleId) {
      if (user.googleId === googleId) {
        return res.status(200).json({ success: true, message: 'Tài khoản Google đã được liên kết', data: { user: user.toJSON() } });
      }
      return res.status(409).json({
        success: false,
        error: { code: 'GOOGLE_ACCOUNT_MISMATCH', message: 'Tài khoản Google này không khớp với tài khoản đã liên kết trước đó' }
      });
    }

    user.googleId = googleId;
    if (!user.avatar && picture) user.avatar = picture;
    user.emailVerified = true;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({ success: true, message: 'Đã liên kết tài khoản Google thành công', data: { user: user.toJSON() } });
  } catch (error) {
    console.error('Link Google error:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Lỗi server' } });
  }
};

/**
 * @desc    Unlink Google account from currently authenticated user
 * @route   DELETE /api/auth/unlink/google
 * @access  Private
 */
const unlinkGoogle = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Người dùng không tồn tại' } });
    }

    if (!user.googleId) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_LINKED', message: 'Google account is not linked.' }
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_PASSWORD',
          message: 'Cannot unlink Google account because this account has no password.'
        }
      });
    }

    user.googleId = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({ success: true, message: 'Google account unlinked successfully.', data: { user: user.toJSON() } });
  } catch (error) {
    console.error('Unlink Google error:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Lỗi server' } });
  }
};

/**
 * @desc    Verify email
 * @route   GET /api/auth/verify-email
 * @access  Public
 */
const verifyEmail = async (req, res) => {
  try {
    const token = req.query.token || req.body.token;
    const email = req.query.email || req.body.email;
    const acceptHeader = req.headers.accept || '';
    const wantsHtml = acceptHeader.includes('text/html');

    const redirectToFrontend = (status, messageText) => {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
      const redirectUrl = `${baseUrl}/verify-email?status=${encodeURIComponent(status)}&message=${encodeURIComponent(messageText)}${emailParam}`;
      return res.redirect(302, redirectUrl);
    };

    if (!token) {
      if (wantsHtml) {
        return redirectToFrontend('error', 'Khong tim thay token xac nhan');
      }
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Token la bat buoc'
        }
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      if (email) {
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser && existingUser.emailVerified) {
          if (wantsHtml) {
            return redirectToFrontend('success', 'Email da duoc kich hoat');
          }
          return res.status(200).json({
            success: true,
            message: 'Email da duoc kich hoat'
          });
        }
      }
      if (wantsHtml) {
        return redirectToFrontend('error', 'Token khong hop le hoac da het han');
      }
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token khong hop le hoac da het han'
        }
      });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;

    if (!user.welcomeEmailSent) {
      fireAndForget(sendWelcomeEmail(user), "Welcome email failed");
      user.welcomeEmailSent = true;
      user.firstLoginAt = new Date();
    }

    await user.save({ validateBeforeSave: false });

    if (wantsHtml) {
      return redirectToFrontend('success', 'Xac nhan email thanh cong');
    }

    res.status(200).json({
      success: true,
      message: 'Xac nhan email thanh cong'
    });
  } catch (error) {
    console.error('Verify email error:', error);

    if (req.accepts('html')) {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const redirectUrl = `${baseUrl}/verify-email?status=error&message=${encodeURIComponent('Loi server')}`;
      return res.redirect(302, redirectUrl);
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Loi server'
      }
    });
  }
};

/**
 * @desc    Resend verification email
 * @route   POST /api/auth/resend-verification
 * @access  Public
 */
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email la bat buoc'
        }
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Khong tim thay nguoi dung'
        }
      });
    }

    if (user.emailVerified || user.googleId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMAIL_ALREADY_VERIFIED',
          message: 'Email da duoc xac nhan'
        }
      });
    }

    const verificationToken = createEmailVerificationToken(user);
    await user.save({ validateBeforeSave: false });

    const verifyUrl = buildVerifyUrl(verificationToken);
    fireAndForget(sendVerificationEmail(user, verifyUrl), "Verification email failed");

    res.status(200).json({
      success: true,
      message: 'Da gui lai email xac nhan'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Loi server'
      }
    });
  }
};

/**
 * @desc    Request password reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email la bat buoc'
        }
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'Neu email ton tai, he thong da gui huong dan dat lai mat khau'
      });
    }

    if (user.googleId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'GOOGLE_ACCOUNT',
          message: 'Tai khoan dang nhap Google khong the su dung chuc nang quen mat khau'
        }
      });
    }

    const resetToken = createPasswordResetToken(user);
    await user.save({ validateBeforeSave: false });

    const resetUrl = buildResetPasswordUrl(resetToken, user.email);
    fireAndForget(sendPasswordResetEmail(user, resetUrl), "Password reset email failed");

    res.status(200).json({
      success: true,
      message: 'Neu email ton tai, he thong da gui huong dan dat lai mat khau'
    });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Loi server'
      }
    });
  }
};

/**
 * @desc    Reset password
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
const resetPassword = async (req, res) => {
  try {
    const { token, password, passwordConfirm } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Token va mat khau la bat buoc'
        }
      });
    }

    if (passwordConfirm && password !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PASSWORD_MISMATCH',
          message: 'Mat khau xac nhan khong khop'
        }
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token khong hop le hoac da het han'
        }
      });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshToken = null;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Dat lai mat khau thanh cong'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Loi server'
      }
    });
  }
};

/**
 * @desc    Request unlock account email
 * @route   POST /api/auth/request-unlock
 * @access  Public
 */
const requestUnlockAccount = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email la bat buoc'
        }
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+lockUntil +unlockToken +unlockTokenExpires');

    if (!user) {
      // Không tiết lộ user không tồn tại vì lý do bảo mật
      return res.status(200).json({
        success: true,
        message: 'Neu tai khoan bi khoa, email mo khoa da duoc gui'
      });
    }

    // Kiểm tra xem tài khoản có bị khóa không
    if (!user.isLocked) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ACCOUNT_NOT_LOCKED',
          message: 'Tai khoan chua bi khoa'
        }
      });
    }

    // Tạo unlock token
    const unlockToken = user.createUnlockToken();
    await user.save({ validateBeforeSave: false });

    // Build unlock URL
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const unlockUrl = `${baseUrl}/unlock-account?token=${unlockToken}&email=${encodeURIComponent(email)}`;

    // Gửi email
    const { fireAndForget: f2, sendUnlockAccountEmail } = require('../services/emailService');
    f2(sendUnlockAccountEmail(user, unlockUrl), "Unlock account email failed");

    res.status(200).json({
      success: true,
      message: 'Email mo khoa tai khoan da duoc gui'
    });
  } catch (error) {
    console.error('Request unlock account error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Loi server'
      }
    });
  }
};

/**
 * @desc    Unlock account with token
 * @route   POST /api/auth/unlock-account
 * @access  Public
 */
const unlockAccount = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Token la bat buoc'
        }
      });
    }

    const user = await User.findByUnlockToken(token);

    if (!user) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token khong hop le hoac da het han'
        }
      });
    }

    // Reset login attempts và mở khóa
    await user.resetLoginAttempts();

    res.status(200).json({
      success: true,
      message: 'Mo khoa tai khoan thanh cong. Ban co the dang nhap ngay bay gio'
    });
  } catch (error) {
    console.error('Unlock account error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Loi server'
      }
    });
  }
};

/**
 * @desc    Admin unlock account
 * @route   POST /api/auth/admin-unlock
 * @access  Private/Admin
 */
const adminUnlockAccount = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email la bat buoc'
        }
      });
    }

    // Kiểm tra quyền admin (req.user được set từ protect middleware)
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Ban khong co quyen thuc hien hanh dong nay'
        }
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+loginAttempts +lockUntil');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Khong tim thay nguoi dung'
        }
      });
    }

    // Reset login attempts
    await user.resetLoginAttempts();

    // Log action (có thể thêm logging system)
    console.log(`Admin ${req.user.email} unlocked account ${email}`);

    res.status(200).json({
      success: true,
      message: `Da mo khoa tai khoan ${email} thanh cong`,
      data: {
        email: user.email,
        name: user.name,
        unlockedBy: req.user.email,
        unlockedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Admin unlock account error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Loi server'
      }
    });
  }
};

module.exports = {
  register,
  login,
  googleLogin,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  requestUnlockAccount,
  unlockAccount,
  adminUnlockAccount,
  logout,
  refreshToken,
  getMe,
  linkGoogle,
  unlinkGoogle
};

