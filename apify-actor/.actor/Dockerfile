FROM apify/actor-node-playwright-chrome:20

COPY --chown=myuser package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --chown=myuser . ./

CMD ["node", "--import", "tsx/esm", "src/main.ts"]
