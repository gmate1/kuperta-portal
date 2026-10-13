FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# bcrypt natív modul build-függőségei
RUN apk add --no-cache --virtual .build python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev && apk del .build
COPY . .
# Nem root felhasználóként fut
USER node
EXPOSE 4000
CMD ["sh", "-c", "node scripts/migrate.js && node src/index.js"]
