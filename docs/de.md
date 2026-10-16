# ConnectLife

## Überblick

Diese Integration bringt die Geräte von **Hisense, Gorenje und ASKO**, die du mit der App
**ConnectLife** steuerst, in Gladys: Klimaanlagen, Luftentfeuchter, Waschmaschinen,
Wäschetrockner, Geschirrspüler, Backöfen und Kühlschränke. Die Integration liest sie aus der
ConnectLife-Cloud, derselben wie die App, und steuert die Klimaanlagen und Luftentfeuchter.

Es ist eine Community-Integration, **nicht mit Hisense, Gorenje, ASKO oder ConnectLife
verbunden**. ConnectLife hat keine öffentliche API: Die Integration spricht das Protokoll der
App, so wie die Community es dokumentiert hat, und kann aufhören zu funktionieren, wenn der
Hersteller es ändert.

> **Ohne die Hardware entwickelt**: Die Integration wurde mit aufgezeichneten Antworten der
> ConnectLife-Cloud geschrieben und getestet, nicht mit einem echten Gerät. Rückmeldungen sind im
> Gladys-Forum willkommen.

## Voraussetzungen

- Gladys Assistant **5.1.0** oder neuer.
- Ein **ConnectLife-Konto** (E-Mail-Adresse und Passwort der App), in dem deine Geräte bereits
  hinzugefügt sind. Ein mit Google, Apple oder Facebook erstelltes Konto hat kein Passwort: Lege
  zuerst eines in der App an.
- Internetzugang für Gladys: Alles läuft über die ConnectLife-Cloud.

## Konfiguration

1. Installiere die Integration (**Integrationen → Von GitHub installieren**, falls sie noch nicht
   im Store ist).
2. Gib im Reiter **Konfiguration** die **ConnectLife-E-Mail** und das **Passwort** ein.
3. Wähle das **Aktualisierungsintervall** (1, 2, 3 oder 5 Minuten; standardmäßig 2). Eine
   Anfrage liest alle Geräte des Kontos, egal wie viele.
4. Wähle die **Sprache der Funktionsnamen** (standardmäßig Französisch).
5. Speichere: Die Geräte erscheinen im Reiter **Erkennung**. Füge die gewünschten hinzu.

Die Schaltfläche **Meine Geräte auflisten** liest das Konto sofort und zeigt, was die
Integration gefunden hat: jedes Gerät, seine Art, ob Gladys es steuern kann und ob es offline
ist.

## Geräte

Jedes Gerät hat die Funktion **Verbindung** (online / offline). Ein Gerät, das offline ist,
aktualisiert nur diese: Seine anderen Werte bleiben die der letzten Abfrage.

### Klimaanlagen

Split-, mobile und Fensterklimaanlagen:

- **Ein / Aus** — Befehl.
- **Modus** — Auto, Kühlen, Heizen, Entfeuchten, Lüften, Befehl. Nur die Modi des Modells werden
  angeboten (Fenstergeräte heizen nicht).
- **Solltemperatur** — 16 bis 32 °C (30 °C bei Fenstergeräten), Befehl.
- **Lüftergeschwindigkeit** — die Stufen des Modells, Befehl.
- **Raumtemperatur** und **Raumfeuchtigkeit**, wenn das Gerät sie misst.

Ein auf Fahrenheit eingestelltes Gerät wird in Gladys in Celsius angezeigt und gesteuert.

### Luftentfeuchter

- **Ein / Aus** — Befehl.
- **Modus** — Dauerbetrieb, Manuell, Auto, Wäschetrocknung, Befehl.
- **Lüftergeschwindigkeit** — Niedrig, Mittel, Hoch, Auto, Befehl.
- **Raumfeuchtigkeit** und **Zielfeuchtigkeit** (nur lesen: Gladys hat keine Steuerung für einen
  Feuchtigkeits-Sollwert).

### Waschmaschinen, Wäschetrockner und Geschirrspüler

Nur lesen:

- **Status** — Aus, Bereitschaft, Startzeitvorwahl, Läuft, Pausiert, Fertig, Fehler.
- **Restzeit** — in Minuten, 0 außerhalb eines Zyklus.
- **Programm** und **Phase** — der Code, den das Gerät meldet („Programm 9"). Die Namen hängen
  vom Modell ab und sind der Integration nicht bekannt.
- **Tür** — offen / geschlossen.

Einen Zyklus aus Gladys zu starten wird nicht angeboten: Eine Maschine belädt und schließt man
direkt vor Ort.

### Backöfen

Absichtlich nur lesen (eine Wärmequelle): **Status**, **Ofentemperatur**, **Restzeit** und
**Tür**.

### Kühlschränke

Nur lesen: **Kühlschranktemperatur** und **Gefrierfachtemperatur** mit ihren **Sollwerten**, für
die Fächer, die das Modell hat. Die Sollwerte sind keine Befehle: Ein falscher Wert würde
Lebensmittel verderben.

### Andere Geräte

Kochfelder, Dunstabzugshauben, Wärmepumpen, Weinkühlschränke und die Arten, die die Integration
noch nicht kennt, erscheinen nur mit ihrer **Verbindung**, nur lesen. Die Schaltfläche **Meine
Geräte auflisten** zeigt sie als „noch nicht unterstützt".

## Widget

Das Widget **ConnectLife-Geräte** zeigt eine Zeile pro Gerät (höchstens zehn): die laufende
Waschmaschine mit der Restzeit, den fertigen Geschirrspüler, die eingeschaltete Klimaanlage, die
Kühlschranktemperaturen, ein Gerät, das offline ist. Es folgt der Sprache des Dashboards.

## Szenen-Auslöser

**Gerätezyklus beendet** startet eine Szene, wenn eine Waschmaschine, ein Wäschetrockner oder
ein Geschirrspüler seinen Zyklus beendet. Wähle optional das Gerät oder die Gerätearten; leer
gelassen passt jedes.

Die folgenden Aktionen der Szene können verwenden:

- `{{triggerEvent.data.device_name}}` — der Name des Geräts;
- `{{triggerEvent.data.appliance_type}}` — `washing_machine`, `tumble_dryer` oder `dishwasher`;
- `{{triggerEvent.data.duration_minutes}}` — die Dauer, die die Integration den Zyklus laufen
  sah;
- `{{triggerEvent.data.program}}` — der Programmcode, wenn das Gerät ihn meldet.

Ein von Hand vorzeitig gestoppter Zyklus löst ihn nicht aus. Das Ende wird bei der nächsten
Abfrage der Cloud erkannt, also höchstens ein Aktualisierungsintervall später.

## Szenen-Beispiele

- **Wäsche fertig**: Auslöser „Gerätezyklus beendet", Art „Waschmaschine" → eine Nachricht
  senden „Die Wäsche ist fertig ({{triggerEvent.data.duration_minutes}} Min.)".
- **Schlafzimmer vor dem Schlafengehen kühlen**: um 21:30 Uhr, wenn das Schlafzimmer über 26 °C
  hat → die Klimaanlage des Schlafzimmers auf Kühlen, 24 °C, einschalten.
- **Niemand zu Hause**: wenn die letzte Person geht → die Klimaanlagen ausschalten.

## Fehlerbehebung

- **„ConnectLife hat die E-Mail-Adresse oder das Passwort abgelehnt"**: Prüfe sie in der App.
  Die Integration versucht es dann nicht mehr, bis du die Konfiguration erneut speicherst:
  Wiederholte Fehlversuche sperren das Konto.
- **„Akzeptiere die neuen Bedingungen"**: Öffne die ConnectLife-App und akzeptiere die neuen
  Bedingungen; die Integration versucht es alle 30 Minuten erneut.
- **„Die ConnectLife-Cloud antwortet nicht"**: Die Cloud oder dein Internetzugang ist gestört.
  Die Integration versucht es bei jeder Aktualisierung erneut.
- **Ein Gerät fehlt**: Prüfe es in der App und drücke dann **Meine Geräte auflisten**.
- **Ein Wert scheint falsch**: Die Bedeutung mancher Codes hängt vom Modell ab. Eröffne ein Issue
  mit dem Modell des Geräts und dem, was die App anzeigt.
- Im Normalbetrieb bleiben die Protokolle ruhig; setze `LOG_LEVEL=debug` für den Container, um
  jede Abfrage zu sehen.

## Grenzen

- Nur Cloud: keine lokale Steuerung. Die Werte sind höchstens ein Aktualisierungsintervall alt.
- Die ConnectLife-Cloud veröffentlicht kein Kontingent; die Integration liest sie einmal pro
  Intervall (eine Anfrage für alle Geräte) und behält ihre Anmelde-Tokens, um sich nicht erneut
  anzumelden.
- Die Namen der Programme und Phasen sind nicht bekannt: nur Codes.
- Kein Fernstart von Waschmaschinen, Trocknern, Geschirrspülern oder Backöfen und kein Befehl für
  den Kühlschrank-Sollwert.
- Nur die europäische ConnectLife-Cloud (die Konten der App in Europa).

## Daten und Datenschutz

E-Mail-Adresse und Passwort bleiben in der Konfiguration von Gladys. Die Anmelde-Tokens der
Cloud werden im Volume `/data` der Integration gespeichert (Datei `connectlife-tokens.json`, nur
für die Integration lesbar), gekennzeichnet mit einem Hash der E-Mail-Adresse, nie mit dem
Passwort. Sonst wird nichts gespeichert und nichts woandershin gesendet als an die
ConnectLife-Cloud.
