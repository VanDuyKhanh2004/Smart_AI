const User = require('../models/User');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken 
} = require('../utils/jwt');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const {
  enqueueWelcomeEmail,
  enqueueVerificationEmail,
  enqueuePasswordResetEmail,
  enqueueUnlockAccountEmail,
} = require('../services/emailQueueService');
const asyncHandler = require('../utils/asyncHandler');
const { getFrontendBaseUrl } = require('../configs/frontendConfig');
const {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../utils/errors');

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
  const baseUrl = getFrontendBaseUrl();
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
  const baseUrl = getFrontendBaseUrl();
  const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
  return `${baseUrl}/reset-password?token=${token}${emailParam}`;
};

/**
 * @desc    Register new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ConflictError('Email đã được đăng ký', 'EMAIL_EXISTS');
  }

  const user = await User.create({
    name,
    email,
    password
  });

  const verificationToken = createEmailVerificationToken(user);

  await user.save({ validateBeforeSave: false });

  const verifyUrl = buildVerifyUrl(verificationToken, user.email);
  enqueueVerificationEmail(user, verifyUrl, req.requestId);

  res.status(201).json({
    success: true,
    message: 'Vui long xac nhan email de kich hoat tai khoan',
    data: {
      email: user.email,
      requiresEmailVerification: true,
      user: user.toJSON()
    }
  });
});

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const maxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);

  if (!email || !password) {
    throw new BadRequestError('Email và mật khẩu là bắt buộc', 'VALIDATION_ERROR');
  }

  const user = await User.findByEmailWithPassword(email.toLowerCase());
  if (!user) {
    throw new UnauthorizedError('Email hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS');
  }

  if (user.isLocked) {
    const retryAfter = Math.ceil((new Date(user.lockUntil).getTime() - Date.now()) / 1000);
    res.setHeader('Retry-After', String(Math.max(retryAfter, 1)));
    throw new AppError('Tai khoan tam thoi bi khoa do dang nhap sai nhieu lan. Vui long thu lai sau.', 429, 'ACCOUNT_LOCKED');
  }

  if (!user.password) {
    throw new ConflictError('Tài khoản này sử dụng Google để đăng nhập. Vui lòng đăng nhập bằng Google.', 'GOOGLE_LOGIN_REQUIRED');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await user.incrementLoginAttempts({ maxAttempts });
    throw new UnauthorizedError('Email hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS');
  }

  if (!user.emailVerified && !user.googleId) {
    throw new ForbiddenError('Vui long xac nhan email truoc khi dang nhap', 'EMAIL_NOT_VERIFIED');
  }

  if (user.loginAttempts || user.lockUntil) {
    user.loginAttempts = 0;
    user.lockUntil = undefined;
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  if (!user.welcomeEmailSent && (user.emailVerified || user.googleId)) {
    enqueueWelcomeEmail(user, req.requestId);
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
});

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { refreshToken: null });

  res.status(200).json({
    success: true,
    message: 'Đăng xuất thành công'
  });
});

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh
 * @access  Public
 */
const refreshTokenFn = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    throw new BadRequestError('Refresh token là bắt buộc', 'VALIDATION_ERROR');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    throw new UnauthorizedError('Refresh token không hợp lệ hoặc đã hết hạn', 'REFRESH_TOKEN_INVALID');
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== token) {
    throw new UnauthorizedError('Refresh token không hợp lệ', 'REFRESH_TOKEN_INVALID');
  }

  const accessToken = generateAccessToken(user);

  res.status(200).json({
    success: true,
    data: {
      accessToken
    }
  });
});

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    throw new NotFoundError('Không tìm thấy người dùng', 'USER_NOT_FOUND');
  }

  res.status(200).json({
    success: true,
    data: {
      user: user.toJSON()
    }
  });
});

/**
 * @desc    Login with Google
 * @route   POST /api/auth/google-login
 * @access  Public
 */
const googleLogin = asyncHandler(async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    throw new BadRequestError('Google credential là bắt buộc', 'VALIDATION_ERROR');
  }

  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
    throw new AppError('GOOGLE_CLIENT_ID chưa được cấu hình trên server', 500, 'SERVER_ERROR');
  }
  if (!client) {
    throw new AppError('Google OAuth2Client chưa được khởi tạo do thiếu GOOGLE_CLIENT_ID', 500, 'SERVER_ERROR');
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });
  } catch (err) {
    throw new UnauthorizedError('Google token không hợp lệ hoặc đã hết hạn', 'INVALID_TOKEN');
  }

  const payload = ticket.getPayload();
  const { sub: googleId, email, name, picture, email_verified } = payload;

  if (!email_verified) {
    throw new UnauthorizedError('Email Google chưa được xác minh', 'GOOGLE_EMAIL_NOT_VERIFIED');
  }

  if (!email) {
    throw new BadRequestError('Không thể lấy email từ tài khoản Google', 'VALIDATION_ERROR');
  }

  let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

  if (user) {
    if (!user.googleId) {
      if (user.emailVerified) {
        user.googleId = googleId;
        if (!user.avatar && picture) user.avatar = picture;
        await user.save({ validateBeforeSave: false });
      } else {
        throw new ForbiddenError('Vui long xac nhan email truoc khi dang nhap bang Google', 'EMAIL_NOT_VERIFIED');
      }
    }
  } else {
    user = await User.create({
      name: name || email.split('@')[0],
      email,
      googleId,
      avatar: picture || null,
      emailVerified: true
    });
  }

  if (!user.emailVerified) {
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });
  }

  if (!JWT_SECRET || JWT_SECRET === 'YOUR_JWT_SECRET') {
    throw new AppError('JWT_SECRET chưa được cấu hình trên server', 500, 'SERVER_ERROR');
  }
  if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET === 'YOUR_REFRESH_SECRET') {
    throw new AppError('JWT_REFRESH_SECRET chưa được cấu hình trên server', 500, 'SERVER_ERROR');
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  if (!user.welcomeEmailSent) {
    enqueueWelcomeEmail(user, req.requestId);
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
});

/**
 * @desc    Link Google account to currently authenticated user
 * @route   POST /api/auth/link/google
 * @access  Private
 */
const linkGoogle = asyncHandler(async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    throw new BadRequestError('Google credential là bắt buộc', 'VALIDATION_ERROR');
  }

  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  const { sub: googleId, email, picture } = payload;

  const existing = await User.findOne({ googleId });
  if (existing && existing._id.toString() !== req.user._id.toString()) {
    throw new ConflictError('Google account đã được liên kết với người dùng khác', 'GOOGLE_LINKED');
  }

  if (email.toLowerCase() !== req.user.email.toLowerCase()) {
    throw new BadRequestError('Email Google không khớp với email tài khoản hiện tại', 'EMAIL_MISMATCH');
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new NotFoundError('Người dùng không tồn tại', 'USER_NOT_FOUND');
  }

  if (user.googleId) {
    return res.status(200).json({ success: true, message: 'Tài khoản Google đã được liên kết', data: { user: user.toJSON() } });
  }

  user.googleId = googleId;
  if (!user.avatar && picture) user.avatar = picture;
  user.emailVerified = true;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({ success: true, message: 'Đã liên kết tài khoản Google thành công', data: { user: user.toJSON() } });
});

/**
 * @desc    Unlink Google account from currently authenticated user
 * @route   DELETE /api/auth/unlink/google
 * @access  Private
 */
const unlinkGoogle = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!user) {
    throw new NotFoundError('Người dùng không tồn tại', 'USER_NOT_FOUND');
  }

  if (!user.googleId) {
    throw new BadRequestError('Google account is not linked.', 'NOT_LINKED');
  }

  if (!user.password) {
    throw new BadRequestError('Cannot unlink Google account because this account has no password.', 'NO_PASSWORD');
  }

  user.googleId = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({ success: true, message: 'Google account unlinked successfully.', data: { user: user.toJSON() } });
});

/**
 * @desc    Verify email
 * @route   GET /api/auth/verify-email
 * @access  Public
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const token = req.query.token || req.body.token;
  const email = req.query.email || req.body.email;
  const acceptHeader = req.headers.accept || '';
  const wantsHtml = acceptHeader.includes('text/html');

  const redirectToFrontend = (status, messageText) => {
    const baseUrl = getFrontendBaseUrl();
    const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
    const redirectUrl = `${baseUrl}/verify-email?status=${encodeURIComponent(status)}&message=${encodeURIComponent(messageText)}${emailParam}`;
    return res.redirect(302, redirectUrl);
  };

  try {
    if (!token) {
      if (wantsHtml) {
        return redirectToFrontend('error', 'Khong tim thay token xac nhan');
      }
      throw new BadRequestError('Token la bat buoc', 'VALIDATION_ERROR');
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
      throw new BadRequestError('Token khong hop le hoac da het han', 'INVALID_TOKEN');
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;

    if (!user.welcomeEmailSent) {
      enqueueWelcomeEmail(user, req.requestId);
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
  } catch (err) {
    if (wantsHtml) {
      return redirectToFrontend('error', err.message || 'Loi xac nhan email');
    }
    throw err;
  }
});

/**
 * @desc    Resend verification email
 * @route   POST /api/auth/resend-verification
 * @access  Public
 */
const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new BadRequestError('Email la bat buoc', 'VALIDATION_ERROR');
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new NotFoundError('Khong tim thay nguoi dung', 'USER_NOT_FOUND');
  }

  if (user.emailVerified || user.googleId) {
    throw new BadRequestError('Email da duoc xac nhan', 'EMAIL_ALREADY_VERIFIED');
  }

  const verificationToken = createEmailVerificationToken(user);
  await user.save({ validateBeforeSave: false });

  const verifyUrl = buildVerifyUrl(verificationToken, user.email);
  enqueueVerificationEmail(user, verifyUrl, req.requestId);

  res.status(200).json({
    success: true,
    message: 'Da gui lai email xac nhan'
  });
});

/**
 * @desc    Request password reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new BadRequestError('Email la bat buoc', 'VALIDATION_ERROR');
  }

  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    return res.status(200).json({
      success: true,
      message: 'Neu email ton tai, he thong da gui huong dan dat lai mat khau'
    });
  }

  if (user.googleId) {
    throw new BadRequestError('Tai khoan dang nhap Google khong the su dung chuc nang quen mat khau', 'GOOGLE_ACCOUNT');
  }

  const resetToken = createPasswordResetToken(user);
  await user.save({ validateBeforeSave: false });

  const resetUrl = buildResetPasswordUrl(resetToken, user.email);
  enqueuePasswordResetEmail(user, resetUrl, req.requestId);

  res.status(200).json({
    success: true,
    message: 'Neu email ton tai, he thong da gui huong dan dat lai mat khau'
  });
});

/**
 * @desc    Reset password
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password, passwordConfirm } = req.body;

  if (!token || !password) {
    throw new BadRequestError('Token va mat khau la bat buoc', 'VALIDATION_ERROR');
  }

  if (passwordConfirm && password !== passwordConfirm) {
    throw new BadRequestError('Mat khau xac nhan khong khop', 'PASSWORD_MISMATCH');
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  }).select('+password');

  if (!user) {
    throw new BadRequestError('Token khong hop le hoac da het han', 'INVALID_TOKEN');
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
});

/**
 * @desc    Request unlock account email
 * @route   POST /api/auth/request-unlock
 * @access  Public
 */
const requestUnlockAccount = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new BadRequestError('Email la bat buoc', 'VALIDATION_ERROR');
  }

  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+lockUntil +unlockToken +unlockTokenExpires');

  if (!user) {
    return res.status(200).json({
      success: true,
      message: 'Neu tai khoan bi khoa, email mo khoa da duoc gui'
    });
  }

  if (!user.isLocked) {
    throw new BadRequestError('Tai khoan chua bi khoa', 'ACCOUNT_NOT_LOCKED');
  }

  const unlockToken = user.createUnlockToken();
  await user.save({ validateBeforeSave: false });

  const baseUrl = getFrontendBaseUrl();
  const unlockUrl = `${baseUrl}/unlock-account?token=${unlockToken}&email=${encodeURIComponent(email)}`;

  enqueueUnlockAccountEmail(user, unlockUrl, req.requestId);

  res.status(200).json({
    success: true,
    message: 'Email mo khoa tai khoan da duoc gui'
  });
});

/**
 * @desc    Unlock account with token
 * @route   POST /api/auth/unlock-account
 * @access  Public
 */
const unlockAccount = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new BadRequestError('Token la bat buoc', 'VALIDATION_ERROR');
  }

  const user = await User.findByUnlockToken(token);

  if (!user) {
    throw new BadRequestError('Token khong hop le hoac da het han', 'INVALID_TOKEN');
  }

  await user.resetLoginAttempts();

  res.status(200).json({
    success: true,
    message: 'Mo khoa tai khoan thanh cong. Ban co the dang nhap ngay bay gio'
  });
});

/**
 * @desc    Admin unlock account
 * @route   POST /api/auth/admin-unlock
 * @access  Private/Admin
 */
const adminUnlockAccount = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new BadRequestError('Email la bat buoc', 'VALIDATION_ERROR');
  }

  if (!req.user || req.user.role !== 'admin') {
    throw new ForbiddenError('Ban khong co quyen thuc hien hanh dong nay', 'FORBIDDEN');
  }

  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+loginAttempts +lockUntil');

  if (!user) {
    throw new NotFoundError('Khong tim thay nguoi dung', 'USER_NOT_FOUND');
  }

  await user.resetLoginAttempts();

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
});

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
  refreshToken: refreshTokenFn,
  getMe,
  linkGoogle,
  unlinkGoogle
};
