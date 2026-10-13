# Fehlstunden

Kleine Web-App für deine WebUntis-Abwesenheiten: Abwesenheiten nach Tagen, ein Grund pro Tag, daraus eine
fertige **Entschuldigung als PDF** (zum Unterschreiben mit ID Austria) und Anwesenheit pro Fach.

Eine Instanz gehört genau einer Person. Jede:r hostet sich die App selbst.

## Starten

```bash
git clone https://github.com/galsever/excuses
cd excuses
docker compose up -d
```

<http://localhost:3000> öffnen und einrichten. Den Setup-Code zeigt:

```bash
docker compose logs | grep Setup-Code
```

| Feld | Beispiel |
|---|---|
| Setup-Code | steht im Log (`[excuses] Setup-Code: ...`), damit niemand anderer deine Instanz übernimmt |
| WebUntis-Server | `schule.webuntis.com`, oder einfach die ganze Login-URL einfügen |
| Schule | der Wert von `?school=` in der Login-URL (wird aus einer eingefügten URL übernommen) |
| Benutzername / Passwort | dein WebUntis-Login |
| Ort | steht auf der Entschuldigung („Wien, am ...“) |

Die App prüft den Login **einmal** bei WebUntis und speichert ihn dann. Danach meldest du dich in der App mit
denselben Daten an. Die Anmeldung in der App geht **nicht** an WebUntis, Tippfehler sperren dein Konto also nicht.
Zugangsdaten ändern: oben rechts auf **Zugangsdaten**.

## Wo deine Daten liegen

Alles liegt im Docker-Volume `data` (im Container `/data`):

- `excuses.db`: SQLite mit dem letzten WebUntis-Stand, deinen Gründen und dem Login.
- `secret.key`: zufälliger Schlüssel, beim ersten Start erzeugt.

Der WebUntis-Login ist mit AES-256-GCM verschlüsselt, der Schlüssel kommt aus `secret.key`. Auch die
Login-Cookies werden damit signiert. Es gibt keine Passwörter in Umgebungsvariablen.

- Eine kopierte `excuses.db` allein verrät nichts. Wer aber den ganzen Server bzw. das Volume hat, hat auch den Schlüssel.
  Wer das trennen will, legt den Schlüssel woanders hin und setzt `KEY_FILE` (z.B. ein Docker- oder Kubernetes-Secret).
- `secret.key` weg heißt: einmal neu einrichten. Die Gründe bleiben erhalten.

## Wichtig

- **Nur über HTTPS oder `localhost` öffnen.** Das Login-Cookie ist `Secure`, über `http://192.168...` klappt die Anmeldung nicht.
  Nicht offen ins Internet stellen: am besten nur im eigenen Netz, über Tailscale oder hinter einem Reverse-Proxy mit HTTPS.
- Schulen sperren Konten nach mehreren falschen Logins. Die App versucht einen abgelehnten Login **nie** automatisch
  nochmal: Sie zeigt einen Fehler und wartet, bis du unter **Zugangsdaten** etwas änderst.
- Synchronisiert wird beim Öffnen (wenn der Stand älter als 30 Minuten ist) oder über den Aktualisieren-Knopf.

## Optionale Umgebungsvariablen

| Variable | Wofür |
|---|---|
| `TZ` | Zeitzone, Standard `Europe/Vienna` |
| `KEY_FILE` | Pfad zum Schlüssel, Standard `/data/secret.key` |
| `EXCUSES_MCP_TOKEN` | schaltet `/api/mcp` frei (MCP-Server für einen KI-Assistenten), mind. 32 Zeichen, z.B. `openssl rand -hex 32` |

## Entwickeln

Node 22, dann:

```bash
npm ci
npm run dev
npm test
```

`npm run probe` holt einmal echte Daten nach `./probe` (gitignored), praktisch zum Testen ohne laufende App.
