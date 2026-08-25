FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @tempest/twitch-ebs... build
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "services/twitch-ebs/dist/cli.js"]
