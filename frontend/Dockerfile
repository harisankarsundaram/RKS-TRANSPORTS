FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm config set fetch-retries 5 && npm config set fetch-retry-maxtimeout 120000 && for i in 1 2 3; do npm ci && break || (echo "npm ci failed, retry ${i}" && sleep 5); done

COPY . .
RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]


