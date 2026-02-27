# 1. Utiliser une image Node.js
FROM node:20-alpine

# 2. Créer le dossier de travail
WORKDIR /app

# 3. Copier les fichiers de dépendances
COPY package*.json ./

# 4. Installer les dépendances
RUN npm install

# 5. Copier tout le code du frontend
COPY . .

# 6. Construire l'application Next.js (Étape cruciale !)
RUN npm run build

# 7. Lancer l'application
CMD ["npm", "start"]