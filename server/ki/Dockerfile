# Mashi-KI – kleiner Vermittler zu OpenRouter (siehe ki.mjs). Keine Pakete, nur Node.
# Nur für die MANUELLE Variante (../couchdb). In Coolify läuft ki.mjs direkt im Image node:24-alpine (../coolify).
FROM node:24-alpine
WORKDIR /app
COPY ki.mjs ./
# nicht als root laufen
USER node
EXPOSE 8080
CMD ["node", "ki.mjs"]
