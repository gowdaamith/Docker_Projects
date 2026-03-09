FROM node:20-alpine as builder 
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src  

FROM gcr.io/distroless/nodejs20-debian11
WORKDIR /app
COPY --from=builder /app/package*.json /app/
COPY --from=builder /app/node_modules  /app/node_modules
COPY --from=builder /app/src   /app/src
USER nonroot
EXPOSE 3000
CMD ["src/server.js"]

