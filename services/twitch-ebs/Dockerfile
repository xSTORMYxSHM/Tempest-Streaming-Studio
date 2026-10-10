FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @tempest/twitch-ebs... \
    && pnpm --filter @tempest/twitch-ebs... build \
    && pnpm --config.inject-workspace-packages=true --filter @tempest/twitch-ebs deploy --prod /prod/ebs

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=build --chown=node:node /prod/ebs ./
ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/cli.js"]
