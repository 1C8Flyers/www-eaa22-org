FROM node:20-bookworm AS dev

ARG HUGO_VERSION=0.125.7
ARG TARGETARCH
WORKDIR /workspace
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
  && apt-get install -y --no-install-recommends wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN if [ "$TARGETARCH" = "arm64" ]; then HUGO_ARCH="arm64"; else HUGO_ARCH="amd64"; fi \
  && wget -qO /tmp/hugo.tar.gz "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-${HUGO_ARCH}.tar.gz" \
  && tar -xzf /tmp/hugo.tar.gz -C /tmp \
  && mv /tmp/hugo /usr/local/bin/hugo \
  && chmod +x /usr/local/bin/hugo \
  && rm -f /tmp/hugo.tar.gz

COPY package.json ./
RUN npm install
RUN npx playwright install --with-deps chromium

COPY . .
EXPOSE 1313
CMD ["npm", "run", "dev:docker"]

FROM dev AS prep
ARG GOOGLE_CALENDAR_API_KEY=""
ARG EVENTS_DAYS_AHEAD=180
ENV GOOGLE_CALENDAR_API_KEY=${GOOGLE_CALENDAR_API_KEY}
ENV EVENTS_DAYS_AHEAD=${EVENTS_DAYS_AHEAD}
RUN npm run build:prepare

FROM klakegg/hugo:ext-alpine AS hugo-build
ARG HUGO_GOOGLE_ANALYTICS_ID=""
ENV HUGO_GOOGLE_ANALYTICS_ID=${HUGO_GOOGLE_ANALYTICS_ID}
WORKDIR /src
COPY --from=prep /workspace/site /src/site
RUN hugo --source /src/site --destination /src/public --minify

FROM nginx:alpine AS runtime
COPY --from=hugo-build /src/public /usr/share/nginx/html
EXPOSE 80
