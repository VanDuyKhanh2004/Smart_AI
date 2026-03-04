# Hướng dẫn Mở khóa Tài khoản

## Tổng quan
Hệ thống tự động khóa tài khoản sau **5 lần đăng nhập sai** và tự động mở khóa sau **30 phút**. Người dùng có 3 cách để mở khóa tài khoản:

## 1. Tự động mở khóa (Mặc định)
- Tài khoản tự động mở khóa sau **30 phút**
- Không cần làm gì, chỉ đợi hết thời gian khóa
- Cấu hình trong `.env`:
  ```env
  LOGIN_MAX_ATTEMPTS=5
  LOGIN_LOCK_MINUTES=30
  ```

## 2. Mở khóa qua Email

### API Endpoint
```http
POST /api/auth/request-unlock
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Response
```json
{
  "success": true,
  "message": "Email mo khoa tai khoan da duoc gui"
}
```

### Người dùng thực hiện:
1. Nhấn "Quên mật khẩu?" hoặc "Mở khóa tài khoản"
2. Nhập email đã đăng ký
3. Kiểm tra email và nhấn link mở khóa
4. Tài khoản được mở khóa ngay lập tức

### Xác thực mở khóa
```http
POST /api/auth/unlock-account
Content-Type: application/json

{
  "token": "unlock_token_from_email"
}
```

### Response
```json
{
  "success": true,
  "message": "Mo khoa tai khoan thanh cong. Ban co the dang nhap ngay bay gio"
}
```

## 3. Admin mở khóa thủ công

### API Endpoint (Yêu cầu quyền Admin)
```http
POST /api/auth/admin-unlock
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Response
```json
{
  "success": true,
  "message": "Da mo khoa tai khoan user@example.com thanh cong",
  "data": {
    "email": "user@example.com",
    "name": "User Name",
    "unlockedBy": "admin@example.com",
    "unlockedAt": "2026-03-04T10:30:00.000Z"
  }
}
```

## Cấu hình Environment Variables

Thêm các biến sau vào file `.env`:

```env
# Login Rate Limiting
LOGIN_MAX_ATTEMPTS=5           # Số lần đăng nhập sai tối đa
LOGIN_LOCK_MINUTES=30          # Thời gian khóa tài khoản (phút)

# Frontend URL (cho email links)
FRONTEND_URL=http://localhost:5173

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_SECURE=false
```

## Luồng xử lý khi đăng nhập

```
1. User đăng nhập sai 5 lần
   ↓
2. Tài khoản bị khóa 30 phút
   ↓
3. User có 3 lựa chọn:
   
   A. Đợi 30 phút → Tự động mở khóa
   
   B. Yêu cầu email mở khóa
      → Nhấn link trong email
      → Mở khóa ngay lập tức
   
   C. Liên hệ Admin
      → Admin mở khóa thủ công
      → Mở khóa ngay lập tức
```

## Bảo mật

- Token mở khóa có hiệu lực **1 giờ**
- Token được hash bằng SHA256 trước khi lưu database
- Email không tiết lộ thông tin tài khoản nếu không tồn tại
- Chỉ Admin mới có quyền mở khóa tài khoản người khác
- Tự động reset login attempts khi đăng nhập thành công

## Frontend Integration

### Màn hình đăng nhập bị khóa
```javascript
if (error.code === 'ACCOUNT_LOCKED') {
  // Hiển thị thông báo + nút "Gửi email mở khóa"
  const retryAfter = response.headers['Retry-After'];
  showLockedMessage(`Tài khoản bị khóa. Thử lại sau ${retryAfter}s`);
  showUnlockButton(); // Nút gửi email mở khóa
}
```

### Trang mở khóa tài khoản
```javascript
// URL: /unlock-account?token=xxx&email=xxx
async function unlockAccount(token) {
  const response = await fetch('/api/auth/unlock-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  
  if (response.ok) {
    // Chuyển về trang đăng nhập
    router.push('/login?unlocked=true');
  }
}
```

## Database Schema Changes

Các trường mới trong User model:

```javascript
{
  loginAttempts: Number,        // Số lần đăng nhập sai
  lockUntil: Date,              // Thời điểm hết khóa
  unlockToken: String,          // Hash của unlock token
  unlockTokenExpires: Date      // Thời điểm token hết hạn
}
```

## Testing

### Test tự động khóa
```bash
# Đăng nhập sai 5 lần
for i in {1..5}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done

# Lần thứ 6 sẽ bị khóa
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}'
# Response: 429 ACCOUNT_LOCKED
```

### Test mở khóa qua email
```bash
# Request unlock email
curl -X POST http://localhost:5000/api/auth/request-unlock \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Check email, get token, then unlock
curl -X POST http://localhost:5000/api/auth/unlock-account \
  -H "Content-Type: application/json" \
  -d '{"token":"token_from_email"}'
```

### Test admin unlock
```bash
curl -X POST http://localhost:5000/api/auth/admin-unlock \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"email":"locked-user@example.com"}'
```

## Troubleshooting

### Email không được gửi
- Kiểm tra cấu hình SMTP trong `.env`
- Đảm bảo SMTP_USER và SMTP_PASS đúng
- Nếu dùng Gmail, cần bật "App Password"

### Token không hợp lệ
- Token có hiệu lực 1 giờ, có thể đã hết hạn
- Yêu cầu gửi lại email mới

### Admin unlock không hoạt động
- Đảm bảo token JWT là của user có `role: 'admin'`
- Kiểm tra middleware `protect` đã được áp dụng

## API Summary

| Endpoint | Method | Access | Description |
|----------|--------|--------|-------------|
| `/api/auth/request-unlock` | POST | Public | Gửi email mở khóa |
| `/api/auth/unlock-account` | POST | Public | Xác thực token và mở khóa |
| `/api/auth/admin-unlock` | POST | Admin | Admin mở khóa tài khoản |

