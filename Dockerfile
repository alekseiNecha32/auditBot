# Base image ships Chromium plus every OS-level library Playwright needs
# already installed, so no apt-get/sudo step is required at build or runtime
# (that's what broke the plain Node buildpack on Render: Playwright's
# `--with-deps` installer needs root to run apt-get, which Render's Node
# build container doesn't allow).
#
# NOTE: this tag must stay in sync with the exact `playwright`/`playwright-core`
# version pinned in package.json — a mismatch causes "browser not found" at
# runtime. Both are currently pinned to 1.61.1.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
