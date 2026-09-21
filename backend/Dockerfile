FROM node:22-alpine
RUN apk add --no-cache openssl tini
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3111
ENTRYPOINT ["/sbin/tini","--"]
CMD ["sh","-c","npx prisma migrate deploy && node src/seed.js && node src/server.js"]
