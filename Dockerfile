# Use the official Puppeteer image
FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to install your app dependencies
USER root
WORKDIR /usr/src/app

# Copy package files and install dependencies
# We skip the manual download because the image already contains Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# --- REMOVE THE EXECUTABLE_PATH LINE THAT WAS HERE ---
# The base image already sets this to the correct location automatically.

COPY package*.json ./
RUN npm install

# Copy the rest of your app files
COPY . .

# Switch back to the secure puppeteer user
USER pptruser

# Start the app
CMD [ "node", "scarper.js" ]
