FROM node:22-alpine

WORKDIR /app

# Install Chromium and matching chromedriver
RUN apk add --no-cache chromium chromium-chromedriver nss freetype harfbuzz ca-certificates ttf-freefont && \
    # Ensure the chromedriver binary is in PATH
    ln -sf /usr/lib/chromium/chromedriver /usr/local/bin/chromedriver

# Expose the path via environment variable for Selenium
ENV CHROMEDRIVER_PATH=/usr/lib/chromium/chromedriver

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]