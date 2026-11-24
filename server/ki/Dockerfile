# Mashi-KI – kleiner Vermittler zu OpenRouter und Prospekt-Leser (siehe ki.mjs). Keine Pakete, nur Node + poppler.
# Gebaut von .github/workflows/ki-image.yml (nach grünen Tests) und veröffentlicht als ghcr.io/dschudschuu/mashi-ki –
# so zieht es Coolify (../coolify/docker-compose.yml). Die manuelle Variante (../couchdb) baut es selbst.
FROM node:24-alpine
LABEL org.opencontainers.image.source="https://github.com/DschuDschuu/Mashi"
LABEL org.opencontainers.image.description="Mashi-KI: Rezepte über OpenRouter, Prospekte lesen (poppler)"
LABEL org.opencontainers.image.licenses="NOASSERTION"
# pdftotext und pdftohtml für „Einkauf planen → Angebote holen“ – einmal beim Bauen statt bei jedem Start
# (vorher installierte der Dienst sie bei jedem Start als root aus dem Netz)
RUN apk add --no-cache poppler-utils
WORKDIR /app
COPY ki.mjs ./
# welche Fassung läuft – steht unter /ki/status (Julia: prüfen, ob das Update angekommen ist)
ARG VERSION=lokal
ENV MASHI_KI_VERSION=$VERSION
# nicht als root laufen
USER node
EXPOSE 8080
CMD ["node", "ki.mjs"]
