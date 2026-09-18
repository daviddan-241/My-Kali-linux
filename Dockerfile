# KaliTerm on Render — Node + Tor + build tools for node-pty
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      tor curl ca-certificates python3 make g++ git \
    && apt-get clean

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production
# Render injects PORT; server.js reads process.env.PORT (defaults to 5000)
EXPOSE 10000
CMD ["node", "server.js"]
