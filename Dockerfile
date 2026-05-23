FROM apify/actor-node-puppeteer-chrome:20 
 
COPY package*.json ./ 
RUN npm install 
 
COPY . ./ 
RUN npx puppeteer browsers install chrome 
 
CMD [ "npm", "start" ] 
