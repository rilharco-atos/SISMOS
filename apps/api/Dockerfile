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
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY assets ./assets
RUN mkdir -p uploads/imagens uploads/pdfs ftp/incoming ftp/processed
EXPOSE 3001
CMD ["node", "dist/main"]
