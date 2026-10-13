# Build kontextus: a projekt gyökere (docker-compose.yml: context: .)

# 1. lépés: a portál (React) buildje
FROM node:22-alpine AS build
WORKDIR /app
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2. lépés: nginx a weboldallal és a portállal
FROM nginx:1.27-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY web/nginx.conf /etc/nginx/conf.d/kuperta.conf
COPY web/proxy_common.conf /etc/nginx/proxy_common.conf
COPY site/ /usr/share/nginx/site/
COPY --from=build /app/dist /usr/share/nginx/portal
EXPOSE 80
