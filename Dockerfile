FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build


FROM caddy:2-alpine AS production

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]