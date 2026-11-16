# Cockpit auf iPhone und iPad einrichten

Du brauchst Zugriff auf das Cockpit-Google-Sheet und die veröffentlichte Cockpit-Webseite. Die Webseite ist öffentlich erreichbar und hat die Adresse `https://<GitHub-Benutzername>.github.io/cockpit/` (dein GitHub-Benutzername, Kleinbuchstaben). Ohne Setup-Code zeigt sie keine Daten. Der **Setup-Code** verbindet die App und die Widgets mit deinen Daten. Kopiere ihn nur aus deinem Sheet in die Eingabefelder auf deinem Gerät. Der Code und der API-Schlüssel gehören in keine Screenshots oder geteilten Kurzbefehle.

## 1. Cockpit auf dem Home-Bildschirm installieren

1. Öffne in **Safari** auf dem iPhone oder iPad die Cockpit-Adresse (siehe oben). Alternativ: im Cockpit-Repository auf GitHub **Settings → Pages → Visit site**. Diese Adresse brauchst du später für `PWA_URL`.
2. Tippe in Safari auf **Teilen** (das Quadrat mit dem Pfeil nach oben). Je nach Safari-Layout findest du **Teilen** im Menü **…**.
3. Scrolle in der Liste nach unten und tippe auf **Zu Home-Bildschirm hinzufügen**. Fehlt die Aktion, tippe unten auf **Aktionen bearbeiten** und füge sie hinzu.
4. Falls der Schalter **Als Web-App öffnen** erscheint, schalte ihn ein. Tippe auf **Hinzufügen** und öffne Cockpit über das neue Symbol.
5. Öffne dein Cockpit-Sheet in **Google Sheets** und tippe unten auf **config**. Suche in der ersten Spalte die Zeile **setupCode**. Halte die Zelle rechts davon gedrückt und tippe auf **Kopieren**.
6. Wechsle zurück zu Cockpit. Tippe ins Feld **Setup-Code**, wähle **Einsetzen** und tippe auf **Cockpit verbinden**.

[Apple-Anleitung zur Installation in Safari](https://support.apple.com/de-ch/guide/iphone/iphea86e5236/ios)

## 2. Scriptable installieren und das Skript einrichten

1. Installiere [Scriptable aus dem App Store](https://apps.apple.com/ch/app/scriptable/id1405459188) und öffne die App einmal.
2. Öffne in Safari `https://raw.githubusercontent.com/<GitHub-Benutzername>/cockpit/main/widgets/Cockpit.js` (oder im Repository **widgets → Cockpit.js → Raw**). Lege den Finger auf den Code, wähle **Alles auswählen** und **Kopieren**. Ist die Datei erst lokal vorhanden, übertrage die unveränderte Datei aufs Gerät und kopiere den Code aus der Vorschau in **Dateien**. [Skript im Repository](../widgets/Cockpit.js)
3. Wechsle zu Scriptable und tippe in der Skriptübersicht oben rechts auf **+**. Tippe in den Editor und wähle **Einsetzen**. Tippe auf den Skriptnamen oben im Editor und benenne das Skript **Cockpit**.
4. Kopiere im Sheet unter **config** erneut den Wert neben **setupCode**. Setze ihn in Scriptable in der Zeile `const SETUP_CODE = "";` zwischen die beiden Anführungszeichen ein. Lass die Anführungszeichen stehen.
5. Kopiere in Safari die veröffentlichte Cockpit-Adresse aus Schritt 1. Setze sie in der Zeile `const PWA_URL = "";` zwischen die Anführungszeichen ein. Nimm die normale Seitenadresse ohne Setup-Code am Ende. Das Widget öffnet diese Adresse beim Antippen.
6. Tippe unten rechts auf **▶︎**, um das Skript zu starten. Wähle **Klein**, **Mittel**, **Gross** oder **Sperrbildschirm**. Schliesse die Vorschau und tippe auf **Fertig**, um zur Skriptliste zurückzukehren.

## 3. Widgets hinzufügen

### Home-Bildschirm

1. Lege den Finger auf eine freie Stelle des Home-Bildschirms, bis die Symbole wackeln.
2. Tippe oben links auf **Bearbeiten → Widget hinzufügen**. Auf älteren Versionen erscheint dort direkt **+**.
3. Suche nach **Scriptable** und tippe darauf. Streiche zur gewünschten Grösse **Klein**, **Mittel** oder **Gross** und tippe auf **Widget hinzufügen**.
4. Tippe auf **Fertig**. Halte das neue Widget gedrückt und tippe auf **Widget bearbeiten** beziehungsweise **Scriptable bearbeiten**.
5. Tippe auf **Script** und wähle **Cockpit**. Tippe ins Feld **Parameter** und gib einen der Werte aus der Tabelle ein. Tippe ausserhalb des Widgets, um die Einstellungen zu schliessen.
6. Wiederhole die Schritte für weitere Grössen oder eine zweite Ansicht.

| Grösse | Inhalt | Parameter, wenn das Feld leer bleibt |
| --- | --- | --- |
| Klein | Karte «To-dos» (die nächsten offenen) und darunter die wichtigste Mail. Ohne To-dos die nächsten Termine. | `heute` |
| Mittel | Zwei Karten nebeneinander: «Termine» und «To-dos». | `heute` |
| Gross | Drei Karten wie in der Vorlage: «To-dos» (mit Anzahl), «Nächste Termine», «Wichtige neue Mails». | `heute` |
| Rechteckig | Nächster Termin und nächstes offenes To-do. | `heute` |

- `todos`, `termine` oder `mails` stellt diese Karte an die erste Stelle und gibt ihr am meisten Platz (im mittleren Widget: diese Karte plus To-dos bzw. Termine).
- `ohne Lektionen` (auch kombiniert, z. B. `termine, ohne Lektionen`) blendet Lektionen unter «Nächste Termine» aus. Sonst füllen Lektionen freie Zeilen; echte Termine haben immer Vorrang.
- Überfällige To-dos erscheinen rot, dringende Mails mit rotem Punkt. Vertrauliche Mails zeigen nur «Vertrauliche Nachricht» und die Kategorie.
- Das Widget passt sich allen Home-Bildschirm-Stilen an (Hell, Dunkel, Getönt, Klar). In «Getönt» und «Klar» färbt iOS alles einfarbig ein; die Karten bleiben dann als zarte Flächen sichtbar (D28).

[Apple-Anleitung zum Hinzufügen und Bearbeiten von Widgets](https://support.apple.com/de-ch/118610) · [Scriptable-Dokumentation zum Widget-Parameter](https://docs.scriptable.app/args/)

### Sperrbildschirm

1. Wecke das iPhone oder iPad und entsperre es, ohne den Home-Bildschirm zu öffnen. Halte den Sperrbildschirm gedrückt und tippe auf **Anpassen → Sperrbildschirm**.
2. Tippe auf **Widgets hinzufügen** beziehungsweise auf das Widget-Feld bei der Uhr. Suche nach **Scriptable** und tippe auf die **rechteckige** Vorschau. Schaffe bei Bedarf Platz, indem du bei einem vorhandenen Widget auf **−** tippst.
3. Schliesse die Auswahl. Tippe das hinzugefügte Scriptable-Widget an, solange der Sperrbildschirm noch im Bearbeitungsmodus ist. Wähle bei **Script** das Skript **Cockpit**. Falls **Parameter** angezeigt wird, kannst du etwa `todos` eintragen.
4. Tippe ausserhalb der Einstellungen und dann auf **Fertig**. Prüfe den Termin und das To-do direkt auf dem Sperrbildschirm. iOS passt die Färbung an das Hintergrundbild an. Die angezeigten Titel sind auf dem Sperrbildschirm sichtbar.

[Apple-Anleitung für Widgets auf dem iPhone](https://support.apple.com/de-ch/118610) · [Apple-Anleitung zum Personalisieren des iPad](https://support.apple.com/de-ch/guide/ipad/ipad99d8ff68/ipados)

### Daten und Fehlerzustand prüfen

1. Starte in Scriptable **Cockpit → ▶︎** mit Internetverbindung. Prüfe alle vier Grössen in der Vorschau und danach auf dem jeweiligen Bildschirm. Wechsle unter **Einstellungen → Anzeige & Helligkeit** zwischen **Hell** und **Dunkel**. Tippe auf jedes platzierte Widget und prüfe, dass die Cockpit-Webseite geöffnet wird.
2. Schalte im Kontrollzentrum den **Flugmodus** ein und **WLAN** aus. Starte die Scriptable-Vorschau erneut. Nach einem erfolgreichen Abruf zeigt sie die zuletzt gespeicherten Daten mit **Stand hh:mm**. Beim ersten Lauf ohne Internet zeigt sie **Verbindung prüfen**. Schalte Flugmodus wieder aus und WLAN ein.
3. Steht **Setup-Code prüfen**, kopiere den aktuellen Code aus der Zeile **setupCode** erneut. Bei **PWA-Adresse einfügen** prüfe die veröffentlichte Seitenadresse im Skript.

iOS entscheidet, wann es ein Widget auf dem Bildschirm aktualisiert. Das Skript schlägt frühestens 15 Minuten nach dem letzten Lauf eine Aktualisierung vor. Für einen neuen Abruf kannst du die Vorschau in Scriptable starten. [Scriptable-Dokumentation zur Aktualisierung](https://docs.scriptable.app/listwidget/#refreshafterdate)

## 4. Siri-Kurzbefehl «Cockpit» für To-dos und Termine

### Adresse und Schlüssel holen

1. Öffne im Cockpit-Google-Sheet den Tab **config**. Suche die Zeilen **shortcutUrl** und **shortcutText**.
2. Fehlt eine der Zeilen (z. B. weil du sie nach dem Standort-Kurzbefehl gelöscht hast), öffne das Sheet am Computer und wähle **Erweiterungen → Apps Script**. Öffne links unter **Dateien** die Datei **gas/weather.gs**. Wähle oben im Feld neben **Ausführen** die Funktion **shortcutSetup** und klicke auf **Ausführen**. Fragt Google nach einer Berechtigung, bestätige mit deinem Konto. Kehre zum Sheet zurück und lade den Tab **config** neu. Nach dem Einrichten aller Kurzbefehle kannst du die zwei Zeilen wieder löschen.
3. Die Zelle neben **shortcutUrl** enthält die Google-Adresse für den Kurzbefehl. In der Zelle neben **shortcutText** steht der Schlüssel direkt hinter `"key":"` bis zum nächsten Anführungszeichen. Kopiere die Werte einzeln, sobald du das jeweilige Feld in den nächsten Schritten erreicht hast.

### Kurzbefehl bauen

1. Öffne **Kurzbefehle → Kurzbefehle** und tippe oben auf **+**. Tippe oben auf den Namen des neuen Kurzbefehls beziehungsweise den Pfeil daneben, wähle **Umbenennen** und gib **Cockpit** ein.
2. Tippe auf **Aktion hinzufügen** oder ins Suchfeld **Aktionen suchen**. Suche **Text diktieren** und tippe auf die passende Aktion. Falls die Aktion eine Sprache anbietet, wähle Deutsch.
3. Suche **Inhalte von URL abrufen** und füge die Aktion unter **Text diktieren** ein. Tippe auf das Feld **URL** und füge die Adresse aus **shortcutUrl** ein. Wenn dort die Variable **Diktierter Text** eingesetzt wurde, lösche sie zuerst.
4. Tippe in **Inhalte von URL abrufen** auf den Pfeil für die weiteren Optionen. Tippe auf **Methode → POST**. Wähle unter **Anfragetext** beziehungsweise **Haupttext anfordern** den Typ **JSON**.
5. Kopiere im Sheet die Zelle neben **shortcutText**. Füge in Kurzbefehle vorübergehend die Aktion **Text** hinzu und setze den Inhalt dort ein. Markiere den Schlüssel zwischen den Anführungszeichen nach `"key":`, tippe auf **Kopieren** und entferne die temporäre **Text**-Aktion mit **×**.
6. Tippe unter **JSON** auf **Neues Feld hinzufügen**. Wähle für die ersten beiden Felder den Typ **Text**, für das dritte den Typ **Wörterbuch**. Trage die Werte gemäss Tabelle ein.

   | Schlüssel | Typ | Wert |
   | --- | --- | --- |
   | `key` | Text | Den kopierten API-Schlüssel einsetzen |
   | `action` | Text | `capture` eingeben |
   | `payload` | Wörterbuch | Auf den Wert bzw. **0 Elemente** tippen. Dort ein Textfeld mit Schlüssel `text` anlegen. Ins Wertfeld tippen, **Variable auswählen** wählen und das Ergebnis der Aktion **Text diktieren** antippen. Es erscheint als farbige Variable. |

   Kurzbefehle setzt das Wörterbuch als JSON zusammen und behandelt dabei auch Anführungszeichen im Diktat. [Apple-Anleitung für die Aktion «Inhalte von URL abrufen»](https://support.apple.com/en-lk/guide/shortcuts/apd58d46713f/ios)

7. Suche **Wörterbuch aus Eingabe abrufen** und füge die Aktion hinzu. Tippe ins Eingabefeld, falls es leer ist, und wähle über **Variable auswählen** das Ergebnis von **Inhalte von URL abrufen**.
8. Füge **Wörterbuchwert abrufen** hinzu. Lass die Aktion auf **Wert** stehen, gib als Schlüssel `data` ein und wähle als Wörterbuch das Ergebnis des vorherigen Schritts. Füge dieselbe Aktion nochmals hinzu, diesmal mit Schlüssel `message` und dem gerade abgerufenen Wert `data` als Wörterbuch.
9. Suche **Mitteilung anzeigen** und füge die Aktion hinzu. Ersetze den voreingestellten Mitteilungstext durch die Variable der letzten Aktion **Wörterbuchwert abrufen**. Tippe auf **Fertig**. [Apple-Benutzerhandbuch für Wörterbuchwerte und Mitteilungen](https://support.apple.com/de-ch/guide/shortcuts/welcome/ios)
10. Tippe in der Kurzbefehle-Übersicht auf **Cockpit**. Erlaube bei der ersten Ausführung Diktat, die Verbindung zur Google-Adresse und Mitteilungen, wenn iOS danach fragt. Diktiere zum Test «Materialliste morgen schreiben». Prüfe die Bestätigung und den Eintrag in der PWA unter **To-dos** oder im Google-Kalender. Lösche anschliessend den Testeintrag. Starte den Kurzbefehl danach auch per «Hey Siri, Cockpit».

Kommt keine Bestätigung, prüfe erst die PWA und den Google-Kalender auf den Eintrag. Öffne danach den Kurzbefehl über **…** und kontrolliere URL, Schlüssel und die Zuordnung der Variablen.

### Auf Rückseite tippen (iPhone)

1. Öffne **Einstellungen → Bedienungshilfen → Tippen → Auf Rückseite tippen**.
2. Tippe auf **Doppeltippen** oder **Dreimal tippen**. Scrolle zum Abschnitt **Kurzbefehle** und wähle **Cockpit**.
3. Tippe bei entsperrtem iPhone entsprechend zwei- oder dreimal auf die Rückseite. Das Diktat für Cockpit sollte starten. [Apple-Anleitung zu «Auf Rückseite tippen»](https://support.apple.com/de-ch/guide/iphone/iphaa57e7885/ios)

## 5. Bestehende Automation «Standort fürs Briefing» nachschlagen

Auf dem iPhone ist die Standort-Automation bereits eingerichtet. Du findest sie unter **Kurzbefehle → Automation → Tageszeit 06:00**. Sie läuft täglich mit **Sofort ausführen**, ohne Ausführungsmitteilung.

- **Aktuellen Standort abrufen** liefert Breitengrad, Längengrad und den Ort. Die Aktion **Text** verwendet den Inhalt aus `shortcutText` mit diesen drei Variablen für `LAT`, `LON` und `ORT`. Der Ortsname heisst je nach Version **Ort** oder **Stadt**.
- **URL** enthält die Adresse aus `shortcutUrl`. **Inhalte von URL abrufen** sendet per **POST** mit der Einstellung **Datei** und der Variable **Text** die Aktion `location.update`.
- Das Backend rundet die Koordinaten auf ungefähr einen Kilometer und behält den letzten Standort. Ein Standort ist für das Briefing 12 Stunden gültig, danach gilt der Wohnort.

Den automatischen Lauf kontrollierst du im Google-Sheet unter **log**. Suche nach **location updated** um ungefähr 06:00 Uhr. Die Standortberechtigung findest du unter **Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Kurzbefehle**.

Falls du später den API-Schlüssel erneuerst, aktualisiere den Setup-Code in der PWA und in Scriptable, den Wert `key` im Siri-Kurzbefehl und den Schlüssel im Text der bestehenden Standort-Automation. Die neuen Werte stehen nach der Erneuerung in **config**.
