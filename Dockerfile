FROM node:18

EXPOSE 3000
ARG APP_DIR=app
WORKDIR /app

# Install necessary dependencies
RUN apt-get update

RUN apt-get install -y python3 build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

RUN apt-get install -y libnss3 libxss1 libasound2 libatk-bridge2.0-0 libgtk-3-0 libgbm-dev

# Copy package.json and yarn.lock
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files except ones in .dockerigore
COPY . .

# Save the working directory path and list files
RUN pwd > output.log && ls -laR >> output.log

RUN mkdir -p logs

# Start the application
ENTRYPOINT ["/bin/bash", "-c","npm start | tee -a logs/runtime.log"]
