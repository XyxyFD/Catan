# ⛵ Inselrunde – Prototyp

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
| Felix       | test     |
| Günther     | test     |
| Kühlschrank | test     |
| Jonas       | test     |

Nur **Felix** (`MAP_EDITOR` in `docker-compose.yml`) kann Spiele erstellen, die Karte generieren/bearbeiten und das Spiel starten.
Die anderen treten bei, wählen ihre Farbe (Rot, Blau, Orange, Weiß, Grün) und sehen die Kartenbearbeitung live.

Nach einer Änderung `docker compose up -d` ausführen – Accounts/Passwörter werden beim Start aktualisiert,
Accounts die nicht mehr in der Liste stehen werden gelöscht.
Groß-/Kleinschreibung beim Namen ist egal.

## Mit mehreren Accounts lokal testen

Jeder Browser hat eigene Cookies, also eigene Logins: z. B. Chrome = Felix, Edge = Günther,
Chrome-Inkognito = Kühlschrank, Edge-InPrivate = Jonas. (Zwei Tabs im selben Browser teilen sich den Login.)

## Ablauf

1. **Lobby**: Felix erstellt ein Spiel (Feldgröße für 3 oder 4 Spieler, 2 oder 3 Inseln). Die anderen klicken „Beitreten“
   und wählen ihre Farbe.
2. **Karten-Editor** (nur Felix, alle sehen es live): Zufallskarte erzeugen, Felder tauschen, Zahlen tauschen,
   Felder übermalen, Zahlen setzen, Häfen neu verteilen, Siegpunktziel einstellen.
   Die Karten sind wie das echte Brett: Land bis zum Rahmen, ein Wasserstreifen zwischen den Inseln, manchmal ein See.
3. **Start**: Reihenfolge wird ausgelost. Aufbau: jeder setzt 2× Siedlung + Straße/Schiff (Schlangenreihenfolge,
   auf jeder Insel erlaubt). Erst wenn alle fertig sind, bringen **beide** Startsiedlungen ihre Rohstoffe (Goldfluss: dann freie Wahl).
4. **Spielzug**: Würfeln → Popup zeigt allen, wer was bekommt → bauen (Figuren aus dem Vorrat aufs Brett ziehen) /
   handeln / Entwicklungskarten → „Zug beenden“.
5. Baukosten, Würfelstatistik und Spielverlauf öffnest du oben rechts bei Bedarf.

## Umgesetzte Regeln

- Würfeln mit Ertragsverteilung (Städte doppelt), Würfelstatistik gesamt und pro Spieler
- Rohstoffe sind unbegrenzt; nur Entwicklungskarten sind limitiert
- Vorrat pro Spieler (laut Anleitung): 5 Siedlungen, 4 Städte, 15 Straßen, 15 Schiffe
- 7 / Ritter: Karten abwerfen (>7 Karten), dann Räuber (Land) **oder** Pirat (Meer) per Drag & Drop versetzen –
  beliebig oft umsetzen, bis man bei einem Spieler zieht. Ziehen ist Pflicht (hat er keine Karten, bekommt man nichts).
  Danach Popup: Dieb und Opfer sehen die gezogene Karte, alle anderen nur, dass gezogen wurde.
- Rückgängig: Bauen, Schiff versetzen und Bank-Tausch kann man im eigenen Zug zurücknehmen
  (Würfeln, Karten ziehen, Entwicklungskarten und Handel mit Mitspielern sind endgültig)
- Aufbau: nach Siedlung + Straße/Schiff gibt man mit „Zug beenden“ weiter (vorher noch umsetzbar)
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
- `public/app.js` – Oberfläche (Vanilla JS + SVG, kein Build-Schritt)
- `public/art.js` – Vektor-Grafiken für Felder, Figuren und Häfen

## Auf einen Server bringen

Den Ordner auf den Server kopieren, Passwörter in `docker-compose.yml` ändern, `docker compose up -d --build`.
Für Zugriff über das Internet sollte noch HTTPS davor (z. B. Caddy oder nginx als Reverse Proxy).
