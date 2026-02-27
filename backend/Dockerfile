# On utilise une version légère de Node.js
FROM node:18-alpine

# On crée un dossier /app dans le conteneur
WORKDIR /app

# On copie les fichiers de dépendances et on installe
COPY package*.json ./
RUN npm install

# On copie tout le reste du code
COPY . .

# On lance le serveur
CMD ["node", "index.js"]