# Backend (Smart AI)

## Thiết lập môi trường
Tạo file `.env` tại thư mục `backend` với các biến chính:
```
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o
MONGODB_URI=mongodb://localhost:27017/smart_ai

# Login Security
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
LOGIN_IP_MAX_ATTEMPTS=20
LOGIN_IP_WINDOW_MINUTES=15
LOGIN_IP_BLOCK_MINUTES=15
```

## Chạy server
```
npm install
npm run dev   # hoặc npm start
```


