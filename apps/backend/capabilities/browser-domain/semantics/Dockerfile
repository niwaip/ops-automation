# Build stage
FROM node:20-bullseye-slim AS builder

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./
COPY prisma ./prisma

RUN npm install

COPY src ./src

RUN npx prisma generate && npm run build

# Production stage
FROM node:20-bullseye-slim AS production

WORKDIR /app

COPY package.json ./
COPY prisma ./prisma

RUN npm install --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 3006

ENV PORT=3006
ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
