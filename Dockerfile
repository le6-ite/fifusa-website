FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Create uploads directory
RUN mkdir -p uploads/images uploads/documents

EXPOSE 3000

CMD ["node", "server/index.js"]
