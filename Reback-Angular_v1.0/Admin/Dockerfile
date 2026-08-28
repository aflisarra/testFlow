FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4200

# --disable-host-check is required so Angular's dev server accepts
# Docker's internal hostname instead of rejecting it as an invalid host.
CMD ["npx", "ng", "serve", "--host", "0.0.0.0", "--port", "4200", "--disable-host-check"]