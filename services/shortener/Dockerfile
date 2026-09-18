# build
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# runtime
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
# uid of the node user, has to be numeric for runAsNonRoot
USER 1000
EXPOSE 8080
CMD ["node", "dist/index.js"]
