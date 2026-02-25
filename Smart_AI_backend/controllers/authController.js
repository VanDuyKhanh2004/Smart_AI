const User = require('../models/User');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken 
} = require('../utils/jwt');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const { sendWelcomeEmail, sendVerificationEmail } = require('../services/emailService');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

    try {
      const verifyUrl = buildVerifyUrl(verificationToken, user.email);
      await sendVerificationEmail(user, verifyUrl);
    } catch (mailError) {
      console.warn('Verification email failed:', mailError.message);
    }

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

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
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

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    if (!user.welcomeEmailSent && (user.emailVerified || user.googleId)) {
      try {
        await sendWelcomeEmail(user);
        user.welcomeEmailSent = true;
        user.firstLoginAt = new Date();
        await user.save({ validateBeforeSave: false });
      } catch (mailError) {
        console.warn('Welcome email failed:', mailError.message);
      }
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
    const user = await User.findById(req.user._id);
    
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

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists
    let user = await User.findOne({ 
      $or: [
        { googleId },
        { email: email.toLowerCase() }
      ]
    });

    if (user) {
      // Update Google ID if user exists but doesn't have it
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save({ validateBeforeSave: false });
      }
    } else {
      // Create new user
      user = await User.create({
        name,
        email,
        googleId,
        avatar: picture,
        password: Math.random().toString(36).slice(-8) // Random password for Google users
      });
    }

    if (!user.emailVerified) {
      user.emailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save({ validateBeforeSave: false });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    if (!user.welcomeEmailSent) {
      try {
        await sendWelcomeEmail(user);
        user.welcomeEmailSent = true;
        user.firstLoginAt = new Date();
        await user.save({ validateBeforeSave: false });
      } catch (mailError) {
        console.warn('Welcome email failed:', mailError.message);
      }
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
    console.error('Google login error:', error);
    
    if (error.message && error.message.includes('Token')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Google token không hợp lệ'
        }
      });
    }

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
      try {
        await sendWelcomeEmail(user);
        user.welcomeEmailSent = true;
        user.firstLoginAt = new Date();
      } catch (mailError) {
        console.warn('Welcome email failed:', mailError.message);
      }
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

    try {
      const verifyUrl = buildVerifyUrl(verificationToken);
      await sendVerificationEmail(user, verifyUrl);
    } catch (mailError) {
      console.warn('Verification email failed:', mailError.message);
    }

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

module.exports = {
  register,
  login,
  googleLogin,
  verifyEmail,
  resendVerification,
  logout,
  refreshToken,
  getMe
};
