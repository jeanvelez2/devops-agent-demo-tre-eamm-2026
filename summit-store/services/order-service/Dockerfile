FROM --platform=linux/amd64 node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY app.js ./
EXPOSE 3000
CMD ["node", "app.js"]
