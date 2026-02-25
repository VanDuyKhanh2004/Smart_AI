/**
 * Admin middleware - verify user has admin role
 * Requires authMiddleware.protect to run first
 */
const adminMiddleware = async (req, res, next) => {
  // Check if user exists (should be set by authMiddleware.protect)
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để truy cập'
      }
    });
  }

  // Check if user has admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền truy cập chức năng này'
      }
    });
  }

  next();
};

module.exports = {
  adminMiddleware
};
