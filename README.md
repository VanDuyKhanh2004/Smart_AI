# Smart AI Agent

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/Frontend-React%2018-61DAFB?logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/DevOps-Docker-2496ED?logo=docker&logoColor=white)

Monorepo thương mại điện tử tích hợp AI, gồm backend API và frontend web.

## Mục lục

- [Tổng quan](#tong-quan)
- [Trạng thái dự án](#trang-thai-du-an)
- [Tính năng chính](#tinh-nang-chinh)
- [Công nghệ sử dụng](#cong-nghe-su-dung)
- [Kiến trúc tổng thể](#kien-truc-tong-the)
- [Cấu trúc dự án](#cau-truc-du-an)
- [Yêu cầu môi trường](#yeu-cau-moi-truong)
- [Chạy nhanh với Docker](#chay-nhanh-voi-docker)
- [Chạy local không Docker](#chay-local-khong-docker)
- [Biến môi trường](#bien-moi-truong)
- [Scripts](#scripts)
- [API và Socket](#api-va-socket)
- [Troubleshooting](#troubleshooting)
- [Bảo mật](#bao-mat)
- [Đóng góp](#dong-gop)
- [License](#license)

## Tổng quan

Project gồm 2 ứng dụng:
- Backend API: Node.js + Express + MongoDB + Socket.IO
- Frontend: React + TypeScript + Vite + TailwindCSS

Mục tiêu của repository này là cung cấp nền tảng full-stack cho:
- Quản lý sản phẩm, giỏ hàng, đơn hàng, wishlist, review
- Quản lý hồ sơ, địa chỉ, cửa hàng, khiếu nại, khuyến mãi
- Tích hợp AI hỗ trợ hỏi đáp/gợi ý
- Realtime event qua Socket.IO

## Trạng thái dự án

- Status: Active development
- Mức độ sẵn sàng: Có thể chạy local/Docker để phát triển và demo
- Mục tiêu gần: Chuẩn hóa test, CI/CD và tài liệu API chi tiết

## Tính năng chính

- Xác thực bằng JWT và Google Login
- CRUD cho domain e-commerce (products, cart, orders, reviews...)
- Upload avatar và phục vụ static file
- Tích hợp AI model qua API key
- Hỗ trợ chạy local hoặc Docker Compose

## Công nghệ sử dụng

### Backend
- Node.js, Express, Mongoose
- Socket.IO
- JWT, bcryptjs
- Multer, Nodemailer

### Frontend
- React 18, TypeScript, Vite
- React Router, TanStack Query, Zustand
- TailwindCSS
- Axios, Socket.IO client

### Hạ tầng
- MongoDB 7
- Docker, Docker Compose

## Kiến trúc tổng thể

```text
[React + Vite Frontend]
  |
  | HTTP (/api) + Socket.IO
  v
[Node.js + Express Backend]
  |
  | Mongoose
  v
[MongoDB]
```

Backend còn tích hợp:
- OpenAI API (AI features)
- SMTP (email notifications)

## Cấu trúc dự án

```text
.
|-- docker-compose.yml
|-- LICENSE
|-- README.md
|-- Smart_AI_backend/
|-- Smart_AI_frontend/
```

Lưu ý: Trong `Smart_AI_backend/` có thêm thư mục `Smart_ai_backend/` (khác chữ hoa/thường), khả năng là bản sao cũ. Luồng chạy chính hiện tại dùng `Smart_AI_backend/` ở cấp gốc.

## Yêu cầu môi trường

- Node.js >= 18
- npm >= 9
- MongoDB (nếu chạy local không dùng Docker)
- Docker + Docker Compose (nếu chạy bằng container)

## Chạy nhanh với Docker

Khuyến nghị cho môi trường demo/onboard.

### 1) Tạo file env cho backend

```bash
cd Smart_AI_backend
cp .env.docker.example .env.docker
```

Điền các biến bắt buộc trong `.env.docker`:
- `OPENAI_API_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

Biến tùy chọn:
- `GOOGLE_CLIENT_ID`
- Cấu hình SMTP (`SMTP_HOST`, `SMTP_USER`, ...)

### 2) Chạy toàn bộ stack

```bash
cd ..
docker compose up --build
```

Sau khi chạy:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- MongoDB: localhost:27017

## Chạy local không Docker

### 1) Backend

Tạo file `.env` tại `Smart_AI_backend/`:

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

### 2) Frontend

Tạo file `.env` tại `Smart_AI_frontend/`:

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

Frontend dev server mặc định: http://localhost:5173

## Biến môi trường

### Backend bắt buộc
- `MONGO_CONNECTION_STRING`
- `OPENAI_API_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

### Backend tùy chọn
- `OPENAI_MODEL` (mặc định: `gpt-4o`)
- `GOOGLE_CLIENT_ID`
- `FRONTEND_URL`
- Nhóm SMTP
- Nhóm cấu hình login rate limit

### Frontend
- `VITE_API_BASE_URL` (mặc định: `http://localhost:5000/api`)
- `VITE_API_URL` (mặc định: `http://localhost:5000`)
- `VITE_GOOGLE_CLIENT_ID`

## Scripts

### Backend (`Smart_AI_backend/package.json`)
- `npm run dev`: chạy dev với nodemon
- `npm start`: chạy production

### Frontend (`Smart_AI_frontend/package.json`)
- `npm run dev`: chạy Vite dev server
- `npm run build`: build production
- `npm run preview`: chạy preview bản build
- `npm run lint`: lint source code

## API và Socket

Backend mount API với prefix `/api` cho các nhóm route:
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

Static avatar:
- `/uploads/avatars/...`

Socket.IO chạy cùng host/port với backend.

## Troubleshooting

- Backend không kết nối MongoDB:
  - Kiểm tra `MONGO_CONNECTION_STRING`
  - Đảm bảo MongoDB đang chạy

- Lỗi CORS:
  - Kiểm tra `FRONTEND_URL` ở backend
  - Kiểm tra `VITE_API_BASE_URL` ở frontend

- Google Login không hoạt động:
  - Kiểm tra `GOOGLE_CLIENT_ID` ở cả backend và frontend

- Tính năng AI lỗi:
  - Kiểm tra `OPENAI_API_KEY`

## Bảo mật

- Không commit file `.env` thật
- Sử dụng secret đủ mạnh cho JWT
- Cấu hình CORS bằng domain production trước khi deploy
- Định kỳ xoay vòng API key và secret

## Đóng góp

1. Fork repository
2. Tạo branch mới: `feature/ten-tinh-nang`
3. Commit theo từng thay đổi nhỏ, rõ ràng
4. Tạo Pull Request mô tả đầy đủ phạm vi thay đổi

## License

Dự án được phát hành theo giấy phép MIT.

Xem chi tiết tại file `LICENSE` ở thư mục gốc.
