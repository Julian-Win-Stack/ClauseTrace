FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
COPY data data
EXPOSE 3000
# Migrations run via compiled JS so tsx isn't needed in production.
CMD ["sh", "-c", "node server/dist/db/migrate.js && node server/dist/index.js"]
