FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm config set fetch-retries 5 && npm config set fetch-retry-maxtimeout 120000 && for i in 1 2 3; do npm install --omit=dev && break || (echo "npm install failed, retry ${i}" && sleep 5); done
COPY src ./src
EXPOSE 3208
CMD ["npm", "start"]


