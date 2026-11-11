FROM node:20-alpine AS builder
WORKDIR /app
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY assets ./assets
COPY scripts ./scripts
RUN mkdir -p uploads/imagens uploads/pdfs ftp/incoming ftp/processed
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/seed-demo-prod.js; node dist/main"]
