FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Non-root (the image's built-in "node" user). OpenShift substitutes its own
# arbitrary UID, which works too: nothing here is written at runtime.
USER 1000

EXPOSE 4001

CMD ["npm", "start"]
