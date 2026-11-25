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
  RateLimitError,
} = require('../utils/errors');
const { hashToken, hashMatches } = require('../utils/tokenHash');
const { generateCsrfToken } = require('../utils/csrf');
const {
  REFRESH_COOKIE_NAME,
  setAuthCookies,
  setCsrfCookie,
  clearAuthCookies,
  generateSessionId,
  applyRefreshSession,
  clearRefreshSession,
  isWithinRefreshConflictWindow,
} = require('../configs/authCookies');
const logger = require('../utils/logger');
const {
  claimResendCooldown,
  startResendCooldown,
  releaseResendCooldown,
  checkLongWindow,
  incrementLongWindow,
  getCooldownSeconds,
} = require('../services/verificationResendService');
const {
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
} = require('../configs/tokenConfig');

// Validate required environment variables for Google Login
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
  logger.warn('GOOGLE_CLIENT_ID chưa được cấu hình trong biến môi trường');
}
if (!JWT_SECRET || JWT_SECRET === 'YOUR_JWT_SECRET' || JWT_SECRET.startsWith('replace_with')) {
  logger.warn('JWT_SECRET chưa được cấu hình trong biến môi trường');
}
if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET === 'YOUR_REFRESH_SECRET' || JWT_REFRESH_SECRET.startsWith('replace_with')) {
  logger.warn('JWT_REFRESH_SECRET chưa được cấu hình trong biến môi trường');
}

const client = GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID'
  ? new OAuth2Client(GOOGLE_CLIENT_ID)
  : null;

const createEmailVerificationToken = (user) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationToken = hashToken(rawToken);
  user.emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS);

  return rawToken;
};

const buildVerifyUrl = (token, email) => {
  const baseUrl = getFrontendBaseUrl();
  const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
  return `${baseUrl}/verify-email?token=${token}${emailParam}`;
};

const createPasswordResetToken = (user) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = hashToken(rawToken);
  user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

  return rawToken;
};

const buildResetPasswordUrl = (token, email) => {
  const baseUrl = getFrontendBaseUrl();
  const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
  return `${baseUrl}/reset-password?token=${token}${emailParam}`;
};

const REFRESH_SESSION_SELECT =
  '+refreshTokenHash +refreshTokenPrevHash +refreshTokenSessionId +refreshTokenRotatedAt +loginAttempts +lockUntil';

const loadUserForRefresh = (userId) => User.findById(userId).select(REFRESH_SESSION_SELECT);

const revokeRefreshSession = async (user) => {
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  clearRefreshSession(user);
  await user.save({ validateBeforeSave: false });
};

const assertRefreshTokenVersion = (user, decoded) => {
  const decodedTokenVersion = decoded.tokenVersion ?? 0;
  if (user.tokenVersion !== undefined && decodedTokenVersion !== user.tokenVersion) {
    throw new UnauthorizedError('Token đã bị thu hồi. Vui lòng đăng nhập lại.', 'TOKEN_REVOKED');
  }
};

/**
 * Classify the presented refresh token against the stored session:
 * - current: the active token, safe to consume/rotate
 * - conflict: the immediately previous token inside the short race window
 * - reuse: any other token while a session is active
 */
const classifyStoredRefreshToken = (user, token) => {
  if (!user.refreshTokenHash) {
    return 'invalid';
  }

  if (hashMatches(token, user.refreshTokenHash)) {
    return 'current';
  }

  if (
    hashMatches(token, user.refreshTokenPrevHash) &&
    isWithinRefreshConflictWindow(user.refreshTokenRotatedAt)
  ) {
    return 'conflict';
  }

  return 'reuse';
};

const handleNonCurrentRefreshToken = async (user, state, res) => {
  if (state === 'conflict') {
    throw new ConflictError(
      'Yêu cầu làm mới token đã được xử lý bởi một yêu cầu khác. Vui lòng thử lại.',
      'REFRESH_TOKEN_CONFLICT',
    );
  }

  if (state === 'reuse') {
    await revokeRefreshSession(user);
    clearAuthCookies(res);
    throw new UnauthorizedError(
      'Refresh token đã được sử dụng trước đó. Vui lòng đăng nhập lại.',
      'REFRESH_TOKEN_REUSED',
    );
  }

  clearAuthCookies(res);
  throw new UnauthorizedError('Refresh token không hợp lệ', 'REFRESH_TOKEN_INVALID');
};

const issueLoginSession = (user, res) => {
  const sessionId = generateSessionId();
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user, { sessionId });

  applyRefreshSession(user, {
    tokenHash: hashToken(refreshToken),
    sessionId,
  });

  setAuthCookies(res, {
    accessToken,
    refreshToken,
    csrfToken: generateCsrfToken(),
  });

  return { accessToken, refreshToken };
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
    if (!existingUser.emailVerified && !existingUser.googleId) {
      const notVerifiedError = new ConflictError(
        'Tài khoản với email này chưa được xác nhận.',
        'EMAIL_NOT_VERIFIED'
      );
      notVerifiedError.data = { email: existingUser.email };
      throw notVerifiedError;
    }
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

  // Registration sends the first verification email and starts the resend
  // cooldown. It must never be blocked by a stale cooldown key or a
  // temporarily unavailable Redis, hence the best-effort call.
  await startResendCooldown(user._id);

  res.status(201).json({
    success: true,
    message: 'Vui long xac nhan email de kich hoat tai khoan',
    data: {
      email: user.email,
      requiresEmailVerification: true,
      resendCooldownSeconds: getCooldownSeconds(),
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

  // A fresh login starts a new single session: bumping tokenVersion revokes
  // access tokens issued for any previous session.
  user.tokenVersion = (user.tokenVersion || 0) + 1;

  const { accessToken, refreshToken } = issueLoginSession(user, res);

  if (!user.welcomeEmailSent && (user.emailVerified || user.googleId)) {
    enqueueWelcomeEmail(user, req.requestId);
    user.welcomeEmailSent = true;
    user.firstLoginAt = new Date();
  }

  await user.save({ validateBeforeSave: false });

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
  // Revoke every access token for this user and drop the refresh session.
  await User.findByIdAndUpdate(req.user._id, {
    $inc: { tokenVersion: 1 },
    $set: {
      refreshTokenHash: null,
      refreshTokenPrevHash: null,
      refreshTokenSessionId: null,
      refreshTokenRotatedAt: null,
    },
  });

  clearAuthCookies(res);

  res.status(200).json({
    success: true,
    message: 'Đăng xuất thành công'
  });
});

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh
 * @access  Public (refresh cookie or legacy body token)
 */
const refreshTokenFn = asyncHandler(async (req, res) => {
  const cookieToken = req.cookies && req.cookies[REFRESH_COOKIE_NAME];
  const bodyToken = req.body && req.body.refreshToken;
  const usingCookie = typeof cookieToken === 'string' && cookieToken.length > 0;
  const token = usingCookie ? cookieToken : bodyToken;

  if (!token) {
    throw new BadRequestError('Refresh token là bắt buộc', 'VALIDATION_ERROR');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    throw new UnauthorizedError('Refresh token không hợp lệ hoặc đã hết hạn', 'REFRESH_TOKEN_INVALID');
  }

  const user = await loadUserForRefresh(decoded.id);
  if (!user) {
    throw new UnauthorizedError('Refresh token không hợp lệ', 'REFRESH_TOKEN_INVALID');
  }

  assertRefreshTokenVersion(user, decoded);

  const state = classifyStoredRefreshToken(user, token);
  if (state !== 'current') {
    await handleNonCurrentRefreshToken(user, state, res);
  }

  if (usingCookie) {
    // Session binding is defense-in-depth: a token with a different sid must
    // not be able to rotate the stored session even if its digest matched.
    if (
      decoded.sid &&
      user.refreshTokenSessionId &&
      decoded.sid !== user.refreshTokenSessionId
    ) {
      clearAuthCookies(res);
      throw new UnauthorizedError('Refresh token không hợp lệ', 'REFRESH_TOKEN_INVALID');
    }

    const sessionId = decoded.sid || user.refreshTokenSessionId || generateSessionId();
    const incomingHash = hashToken(token);
    const accessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user, { sessionId });
    const newHash = hashToken(newRefreshToken);
    const rotatedAt = new Date();

    // Atomic compare-and-swap: exactly one concurrent request may consume the
    // current digest. The losing request never receives the replacement token
    // and never destroys the winner's new session.
    const updated = await User.findOneAndUpdate(
      {
        _id: user._id,
        refreshTokenHash: incomingHash,
        tokenVersion: user.tokenVersion ?? 0,
      },
      {
        $set: {
          refreshTokenHash: newHash,
          refreshTokenPrevHash: incomingHash,
          refreshTokenSessionId: sessionId,
          refreshTokenRotatedAt: rotatedAt,
        },
      },
      { new: true },
    );

    if (!updated) {
      const latest = await loadUserForRefresh(user._id);
      const latestVersion = latest ? (latest.tokenVersion ?? 0) : null;
      const currentVersion = user.tokenVersion ?? 0;

      if (latestVersion !== null && latestVersion !== currentVersion) {
        clearAuthCookies(res);
        throw new UnauthorizedError('Token đã bị thu hồi. Vui lòng đăng nhập lại.', 'TOKEN_REVOKED');
      }

      throw new ConflictError(
        'Yêu cầu làm mới token đã được xử lý bởi một yêu cầu khác. Vui lòng thử lại.',
        'REFRESH_TOKEN_CONFLICT',
      );
    }

    setAuthCookies(res, { accessToken, refreshToken: newRefreshToken });

    return res.status(200).json({
      success: true,
      data: { accessToken }
    });
  }

  // Legacy body-token path: keep the existing non-rotating behaviour for the
  // current frontend. Cookies are also issued so the client can migrate to the
  // cookie flow without a protocol break; no refresh token is rotated here.
  const accessToken = generateAccessToken(user);

  setAuthCookies(res, {
    accessToken,
    refreshToken: token,
    csrfToken: generateCsrfToken(),
  });

  res.status(200).json({
    success: true,
    data: {
      accessToken
    }
  });
});

/**
 * @desc    Issue/read the CSRF double-submit token
 * @route   GET /api/auth/csrf
 * @access  Public
 */
const getCsrfToken = asyncHandler(async (req, res) => {
  const csrfToken = generateCsrfToken();
  setCsrfCookie(res, csrfToken);

  res.status(200).json({
    success: true,
    data: { csrfToken }
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

  // Google login is a fresh login: start a new single session and revoke the
  // previous session's access tokens.
  user.tokenVersion = (user.tokenVersion || 0) + 1;

  const { accessToken, refreshToken } = issueLoginSession(user, res);

  if (!user.welcomeEmailSent) {
    enqueueWelcomeEmail(user, req.requestId);
    user.welcomeEmailSent = true;
    user.firstLoginAt = new Date();
  }

  await user.save({ validateBeforeSave: false });

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

  if (!token) {
    if (wantsHtml) {
      return redirectToFrontend('error', 'Khong tim thay token xac nhan');
    }
    throw new BadRequestError('Token la bat buoc', 'VALIDATION_ERROR');
  }

  const hashedToken = hashToken(token);

  // Match on the stored hash alone, then classify expiry separately so that an
  // expired token and a superseded/invalid token return distinct, stable codes.
  const user = await User.findOne({ emailVerificationToken: hashedToken })
    .select('+emailVerificationToken +emailVerificationExpires');

  if (!user) {
    if (email) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser && existingUser.emailVerified) {
        // Replay of a consumed link, or a link for an account already verified
        // through another route. Cannot be "verified again" — report deterministically.
        if (wantsHtml) {
          return redirectToFrontend('success', 'Email da duoc kich hoat');
        }
        return res.status(200).json({
          success: true,
          message: 'Email da duoc kich hoat',
          data: { status: 'ALREADY_VERIFIED' },
        });
      }
    }
    if (wantsHtml) {
      return redirectToFrontend('invalid', 'Lien ket xac nhan khong con hop le. Vui long su dung email xac nhan moi nhat.');
    }
    throw new BadRequestError(
      'Liên kết xác nhận không còn hợp lệ. Vui lòng sử dụng email xác nhận mới nhất.',
      'INVALID_VERIFICATION_TOKEN'
    );
  }

  if (new Date(user.emailVerificationExpires).getTime() <= Date.now()) {
    if (wantsHtml) {
      return redirectToFrontend('expired', 'Lien ket xac nhan da het han. Vui long yeu cau gui lai email xac nhan.');
    }
    throw new BadRequestError(
      'Liên kết xác nhận đã hết hạn. Vui lòng yêu cầu gửi lại email xác nhận.',
      'VERIFICATION_TOKEN_EXPIRED'
    );
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

  // 1) Atomically claim the 60-second per-account cooldown (SET NX EX).
  //    Near-simultaneous requests are serialized by Redis, so at most one
  //    resend per account can proceed within the cooldown window.
  const cooldown = await claimResendCooldown(user._id);
  if (!cooldown.allowed) {
    throw new RateLimitError(
      'Vui long cho truoc khi gui lai email xac nhan.',
      'VERIFICATION_EMAIL_COOLDOWN',
      cooldown.retryAfterSeconds
    );
  }

  // 2) Long-window check: cap at 5 successful resends / 15 minutes per account.
  //    The cooldown claimed above belongs to this request alone, so on rejection
  //    roll it back instead of leaving an extra 60-second cooldown on top of the
  //    15-minute denial. The token/email lifecycle is untouched on this path.
  const windowCheck = await checkLongWindow(user._id);
  if (!windowCheck.allowed) {
    await releaseResendCooldown(user._id);
    throw new RateLimitError(
      'Ban da gui qua nhieu email xac nhan. Vui long thu lai sau.',
      'VERIFICATION_EMAIL_RATE_LIMITED',
      windowCheck.retryAfterSeconds
    );
  }

  const verificationToken = createEmailVerificationToken(user);
  await user.save({ validateBeforeSave: false });

  const verifyUrl = buildVerifyUrl(verificationToken, user.email);
  enqueueVerificationEmail(user, verifyUrl, req.requestId);

  // Only a fully successful send is counted against the long window.
  await incrementLongWindow(user._id);

  res.status(200).json({
    success: true,
    message: 'Da gui lai email xac nhan',
    data: {
      resendCooldownSeconds: getCooldownSeconds()
    }
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
  clearRefreshSession(user);
  user.tokenVersion = (user.tokenVersion || 0) + 1;

  await user.save();

  clearAuthCookies(res);

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

  logger.info(
    { adminUserId: req.user._id, unlockedUserId: user._id },
    'Admin unlocked account',
  );

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
  getCsrfToken,
  getMe,
  linkGoogle,
  unlinkGoogle
};
