# Smart AI Backend

Express 4 (CommonJS) REST + Socket.IO API for the Smart AI e-commerce platform. Connects to MongoDB (Atlas for `$vectorSearch`), Redis (cache / BullMQ / chat context), Cloudinary (images), Brevo (transactional email), and OpenAI/Gemini (AI chat).

## Environment Setup

Create `.env` in `Smart_AI_backend/` with the key variables:

```
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000

MONGO_CONNECTION_STRING=mongodb://localhost:27017/smart_ai

OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o
GEMINI_API_KEY=your_gemini_api_key

JWT_SECRET=replace_with_a_strong_jwt_secret
JWT_EXPIRE=15m
JWT_REFRESH_SECRET=replace_with_a_strong_refresh_secret
JWT_REFRESH_EXPIRE=7d

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Transactional email via Brevo API (no SMTP)
BREVO_API_KEY=your_brevo_api_key
BREVO_FROM_EMAIL=your_sender_email@example.com
BREVO_FROM_NAME=Smart AI

# Login Security
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
LOGIN_IP_MAX_ATTEMPTS=20
LOGIN_IP_WINDOW_MINUTES=15
LOGIN_IP_BLOCK_MINUTES=15
```

See [../README.md](../README.md) for the full environment variable table.

## Run the server

```
npm install
npm run dev   # or npm start
```

Starts on `http://localhost:5000`. Swagger UI is served at `/api-docs`.

## Tests

```
npm test                 # Full suite (1611 tests, 39 suites; verified 2026-08-04)
npm test -- --runInBand  # Sequential (recommended)
```
