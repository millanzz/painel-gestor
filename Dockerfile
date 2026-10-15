FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci || npm install
COPY . .
# Variáveis do front são lidas na hora do build (o Render as repassa como build args)
ARG VITE_SENTRY_DSN VITE_MAPA_TILES VITE_MAPA_ATRIBUICAO
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN VITE_MAPA_TILES=$VITE_MAPA_TILES VITE_MAPA_ATRIBUICAO=$VITE_MAPA_ATRIBUICAO
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY web/package.json web/
RUN (npm ci --omit=dev -w server || npm install --omit=dev -w server)
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/db server/db
COPY --from=build /app/web/dist web/dist
EXPOSE 3000
CMD ["sh", "-c", "node server/dist/migrate.js && node server/dist/index.js"]
