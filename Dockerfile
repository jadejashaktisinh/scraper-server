# Use the official Puppeteer image which includes Chrome and all dependencies
FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to install your app dependencies
USER root
WORKDIR /usr/src/app

# Copy package files and install dependencies
# We skip the Chromium download because the image already has it
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

COPY package*.json ./
RUN npm install

# Copy the rest of your app files
COPY . .

# Switch back to the secure puppeteer user
USER pptruser

# Start the app
CMD [ "node", "scarper.js" ]
