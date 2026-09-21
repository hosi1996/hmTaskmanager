FROM node:22-alpine
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY src ./src
USER node
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","src/index.js"]
