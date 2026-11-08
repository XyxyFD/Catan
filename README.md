# ⛵ Archipel – Prototyp

Browser-Spiel für 2–4 Spieler: Inseln besiedeln, Rohstoffe sammeln, handeln, Straßen und Schiffe bauen.
Alles läuft in Docker (App + PostgreSQL), lokal muss nichts installiert werden außer Docker.

## Starten

```bash
docker compose up -d --build
```

Dann im Browser: **http://localhost:3000**

Stoppen: `docker compose down` (Spielstände bleiben im Docker-Volume `dbdata` erhalten).
Alles löschen inkl. Spielstände: `docker compose down -v`.

## Accounts

In `docker-compose.yml` unter `APP_USERS` (Format `Name:Passwort,Name:Passwort`):

| Name    | Passwort |
|---------|----------|
| Felix   | test     |
| Papa    | test     |
| Bruder1 | test     |
| Bruder2 | test     |

Nach einer Änderung `docker compose up -d` ausführen – Accounts/Passwörter werden beim Start aktualisiert.
Groß-/Kleinschreibung beim Namen ist egal.

## Mit mehreren Accounts lokal testen

Jeder Browser hat eigene Cookies, also eigene Logins: z. B. Chrome = Felix, Edge = Papa,
Chrome-Inkognito = Bruder1, Edge-InPrivate = Bruder2. (Zwei Tabs im selben Browser teilen sich den Login.)

## Ablauf

1. **Lobby**: Spiel erstellen (Feldgröße für 3 oder 4 Spieler, 2 oder 3 Inseln). Die anderen klicken „Beitreten“.
2. **Karten-Editor** (alle sehen Änderungen live): Zufallskarte erzeugen, Felder tauschen, Zahlen tauschen,
   Felder übermalen, Zahlen setzen, Häfen neu verteilen, Siegpunktziel einstellen.
3. **Start** (nur der Ersteller): Reihenfolge wird ausgelost. Aufbau: jeder setzt 2× Siedlung + Straße/Schiff
   (Schlangenreihenfolge, nur auf der größten Insel = Startinsel). Die zweite Siedlung bringt Starterträge.
4. **Spielzug**: Würfeln → Erträge → bauen / handeln / Entwicklungskarten → „Zug beenden“.

## Umgesetzte Regeln

- Würfeln mit Ertragsverteilung (Städte doppelt), Bank-Limits, Würfelstatistik (mit erwarteter Verteilung)
- 7: Karten abwerfen (>7 Karten), Räuber (Land) **oder** Pirat (Meer) versetzen, Karte stehlen
- Straßen, Siedlungen (Abstandsregel), Städte, Schiffe; Übergang Straße↔Schiff nur über eigene Siedlung
- Schiffe versetzen (1× pro Zug, offenes Ende, nicht im selben Zug gebaut), Pirat blockiert Schiffe
- Goldfluss: Rohstoff nach Wahl
- +2 Siegpunkte für die erste Siedlung auf jeder weiteren Insel
- Längste Handelsstraße (Straßen + Schiffe), größte Rittermacht
- Entwicklungskarten: Ritter, Siegpunkt, Straßenbau, Erfindung, Monopol
- Handel: Bank 4:1, Häfen 3:1 / 2:1, Spielertausch (aktiver Spieler schlägt vor, anderer bestätigt; der Tausch steht im Spielverlauf)
- Jeder sieht nur seine eigenen Karten; bei anderen nur die Anzahl

## Technik

- `server/index.js` – Express + Socket.io, Login (Cookie-Session), speichert Spielstände als JSON in Postgres
- `shared/board.js` – Hex-Geometrie, Inselgenerator, Häfen
- `shared/engine.js` – Spielregeln (Server prüft alle Züge; Browser nutzt dieselben Funktionen zum Markieren)
- `public/` – Oberfläche (Vanilla JS + SVG, kein Build-Schritt)

## Auf einen Server bringen

Den Ordner auf den Server kopieren, Passwörter in `docker-compose.yml` ändern, `docker compose up -d --build`.
Für Zugriff über das Internet sollte noch HTTPS davor (z. B. Caddy oder nginx als Reverse Proxy).
