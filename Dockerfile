# Mecena on Fly.io: one Node server (next start) with a persistent volume at /data.
FROM node:25-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* are inlined into the client bundle at build time: pass them as build args
# (fly deploy --build-arg NEXT_PUBLIC_REVENUECAT_API_KEY=...). Empty key = mock paywall.
ARG NEXT_PUBLIC_REVENUECAT_API_KEY=""
ARG NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID="mecena_pro"
ARG NEXT_PUBLIC_REVENUECAT_OFFERING_ID="default"
ARG NEXT_PUBLIC_PURCHASES_MOCK=""
ENV NEXT_PUBLIC_REVENUECAT_API_KEY=$NEXT_PUBLIC_REVENUECAT_API_KEY \
    NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID=$NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID \
    NEXT_PUBLIC_REVENUECAT_OFFERING_ID=$NEXT_PUBLIC_REVENUECAT_OFFERING_ID \
    NEXT_PUBLIC_PURCHASES_MOCK=$NEXT_PUBLIC_PURCHASES_MOCK
RUN npm run build

FROM node:25-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    MECENA_DATA_DIR=/data \
    PORT=3000
# Whole app incl. data/calls and data/demo (read-only calls and seed, resolved from the cwd).
COPY --from=build /app ./
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
