# Smart AI Agent

Monorepo gom 2 phần chính:
- Backend API: Node.js + Express + MongoDB + Socket.IO
- Frontend: React + TypeScript + Vite + TailwindCSS

Project hỗ trợ:
- Xác thực (JWT, Google Login)
- Quản lý sản phẩm, giỏ hàng, đơn hàng, wishlist, review, địa chỉ, cửa hàng
- Hỏi đáp/AI gợi ý
- Upload avatar
- Thông báo realtime qua Socket.IO

## 1) Cấu trúc thư mục

```text
.
|-- docker-compose.yml
|-- Smart_AI_backend/
|-- Smart_AI_frontend/
```

Lưu ý: Trong `Smart_AI_backend/` đang có thêm thư mục con `Smart_ai_backend/` (khác chữ hoa/thường), có vẻ là bản sao dữ liệu. Luồng chạy chính hiện tại dùng thư mục `Smart_AI_backend/` ở cấp gốc.

## 2) Yêu cầu môi trường

- Node.js >= 18
- npm >= 9
- MongoDB (nếu chạy local không dùng Docker)
- Docker + Docker Compose (nếu chạy bằng container)

## 3) Chạy nhanh bằng Docker (khuyến dùng)

### B1. Tạo env cho backend

Trong thư mục `Smart_AI_backend/`:

```bash
cp .env.docker.example .env.docker
```

Sau đó cập nhật các biến quan trọng trong `.env.docker`:
- `OPENAI_API_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID` (nếu dùng Google Login)
- Cấu hình SMTP (nếu muốn gửi email)

### B2. Chạy compose

Tại thư mục gốc project:

```bash
docker compose up --build
```

Sau khi chạy:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- MongoDB: localhost:27017

## 4) Chạy local không Docker

### 4.1 Backend

Trong `Smart_AI_backend/`, tạo file `.env` với nội dung tối thiểu:

```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

MONGO_CONNECTION_STRING=mongodb://localhost:27017/smart_ai

OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o

JWT_SECRET=your_jwt_secret
JWT_EXPIRE=15m
JWT_REFRESH_SECRET=your_refresh_secret
JWT_REFRESH_EXPIRE=7d

GOOGLE_CLIENT_ID=

LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
LOGIN_IP_MAX_ATTEMPTS=20
LOGIN_IP_WINDOW_MINUTES=15
LOGIN_IP_BLOCK_MINUTES=15

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false
SMTP_FROM=
```

Chạy backend:

```bash
cd Smart_AI_backend
npm install
npm run dev
```

### 4.2 Frontend

Trong `Smart_AI_frontend/`, tạo file `.env`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=
```

Chạy frontend:

```bash
cd Smart_AI_frontend
npm install
npm run dev
```

Mặc định Vite sẽ mở ở: http://localhost:5173

## 5) Scripts chính

### Backend (`Smart_AI_backend/package.json`)
- `npm run dev`: chạy dev với nodemon
- `npm start`: chạy production mode

### Frontend (`Smart_AI_frontend/package.json`)
- `npm run dev`: chay Vite dev server
- `npm run build`: build production
- `npm run preview`: preview bản build
- `npm run lint`: lint source code

## 6) API modules chính (backend)

Prefix: `/api`

- `/auth`
- `/products`
- `/complaints`
- `/cart`
- `/orders`
- `/reviews`
- `/wishlist`
- `/compare`
- `/questions`
- `/dashboard`
- `/addresses`
- `/profile`
- `/promotions`
- `/stores`
- `/appointments`

Tài nguyên static avatar:
- `/uploads/avatars/...`

## 7) Socket.IO

Backend khởi tạo Socket.IO trên cùng host/port với API.
Frontend sử dụng URL server được suy ra từ `VITE_API_BASE_URL`.

## 8) Lỗi thường gặp

- Backend không kết nối MongoDB:
  - Kiểm tra `MONGO_CONNECTION_STRING`
  - Kiểm tra MongoDB đã chạy chưa

- Lỗi CORS:
  - Kiểm tra `FRONTEND_URL` trên backend
  - Kiểm tra `VITE_API_BASE_URL` trên frontend

- Google Login không hoạt động:
  - Kiểm tra `GOOGLE_CLIENT_ID` trên cả backend và frontend

- Tính năng AI lỗi:
  - Kiểm tra `OPENAI_API_KEY`

## 9) Ghi chú bảo mật

- Không commit file `.env` thật
- Sử dụng JWT secrets mạnh
- Giới hạn truy cập CORS đúng domain production trước khi deploy

---

Nếu bạn muốn, mình có thể viết tiếp:
1) README riêng cho backend theo format API docs
2) README riêng cho frontend theo feature
3) file `.env.example` cho frontend để onboarding nhanh hơn
