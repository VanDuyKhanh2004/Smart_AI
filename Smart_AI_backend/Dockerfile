FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN if [ -f package-lock.json ]; then \
    npm ci --omit=dev; \
    else \
    npm install --omit=dev; \
    fi

COPY . .

RUN mkdir -p uploads/avatars

ENV NODE_ENV=production

EXPOSE 5000

CMD ["npm", "start"]