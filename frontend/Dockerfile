FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production PORT=3110 HOST=0.0.0.0
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
USER node
EXPOSE 3110
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","build"]
