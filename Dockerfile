FROM node:22-slim
WORKDIR /app
# Build tools in case the database library has to compile on this machine
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
ENV DB_PATH=/data/agronomiz.db
EXPOSE 3000
CMD ["node", "src/server.js"]
