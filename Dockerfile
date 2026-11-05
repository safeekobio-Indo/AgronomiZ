FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV DB_PATH=/data/agronomiz.db
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "src/server.js"]
