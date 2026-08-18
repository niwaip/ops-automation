# Build stage
FROM node:20-bullseye-slim AS builder

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./

RUN npm install

COPY src ./src

RUN npm run build

# Production stage
FROM node:20-bullseye-slim AS production

WORKDIR /app

COPY package.json ./
RUN npm install --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "dist/main.js"]