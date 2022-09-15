FROM node:16.17.0-alpine

RUN apk update && apk add tzdata
ENV TZ=America/Chicago
ENV NODE_ENV=production
WORKDIR /opt/app
COPY . /opt/app/
CMD [ "npm", "run", "start" ]
