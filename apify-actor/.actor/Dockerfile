FROM apify/actor-node-playwright-chrome:20

COPY --chown=myuser package*.json ./
RUN npm install --no-audit --no-fund

COPY --chown=myuser . ./
RUN npm run build \
  && ls -la dist \
  && test -f dist/main.js \
  && test -f dist/actor.js \
  && npm prune --omit=dev --no-audit --no-fund

CMD ["node", "./dist/main.js"]
