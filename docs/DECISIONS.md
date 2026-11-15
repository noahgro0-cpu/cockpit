# Entscheide

Abweichungen von und Präzisierungen zu `SPEC.md`. Format: Datum, Entscheid, Begründung, Quelle.

## D1 – clasp 3.x: Befehle (2026-11-14)
**Entscheid:** `clasp create --type sheets --title Cockpit --rootDir src`; Ausrollen mit `clasp push` und `clasp deploy -i <ID>` (oder `clasp redeploy <ID>`). Installiert ist clasp 3.4.1.
**Begründung:** In clasp 3 heissen die Befehle `create-script`, `create-deployment`, `update-deployment`; `create`, `deploy`, `redeploy` bleiben als Aliase. `deploy -i` ist weiterhin vorhanden. Die Befehle in AGENTS.md stimmen also.
**Quelle:** `clasp --help`, `clasp create-script --help`, `clasp create-deployment --help` (clasp 3.4.1).

## D2 – Gmail über den Advanced Service mit `gmail.modify` (2026-11-14)
**Entscheid:** Gmail wird nur über den Advanced Service «Gmail» (Gmail API v1) angesprochen, Scope `https://www.googleapis.com/auth/gmail.modify`. `GmailApp` wird nicht verwendet. Übrige Scopes: `spreadsheets.currentonly`, `calendar`, `script.external_request`, `script.scriptapp`.
**Begründung:** Die Referenz listet für `GmailApp.search`, `getMessageById`, `getUserLabelByName`, `moveThreadToArchive` ausschliesslich `https://mail.google.com/` (Vollzugriff inkl. endgültigem Löschen). `gmail.modify` erlaubt Lesen, Labels setzen und Archivieren, aber kein endgültiges Löschen – passt zum Grundsatz «nichts löschen». Advanced Services sind kostenlos.
**Quelle:** https://developers.google.com/apps-script/reference/gmail/gmail-app ; https://developers.google.com/apps-script/concepts/scopes ; https://developers.google.com/workspace/gmail/api/auth/scopes

## D3 – Gemini: `generateContent` statt Interactions-API (2026-11-14)
**Entscheid:** Bei `generateContent` bleiben (`/v1beta/models/<model>:generateContent`, `systemInstruction`, `generationConfig.responseMimeType` + `responseJsonSchema`, Header `x-goog-api-key`).
**Begründung:** Google empfiehlt für neue Projekte die Interactions-API und bezeichnet `generateContent` als «legacy», schreibt aber ausdrücklich: «`generateContent` remains fully supported», ohne Abschaltdatum. Die Interactions-API speichert Interaktionen standardmässig serverseitig (`store=true`) – für Mail-Inhalte unerwünscht. Wir brauchen keine ihrer neuen Funktionen. Der Aufruf liegt gekapselt in einer Funktion; ein Wechsel ist später klein.
**Quelle:** https://aistudio.google.com/docs/migrate-to-interactions ; https://aistudio.google.com/api-reference/generate-content ; https://blog.google/innovation-and-ai/technology/developers-tools/interactions-api-general-availability/

## D4 – Gemini-Modell und Limits (2026-11-14)
**Entscheid:** Standard `aiModel = gemini-3.5-flash-lite`. Gratis-Limits (vom Nutzer in AI Studio abgelesen, 2026-11-14): 15 RPM, 250 000 TPM, 500 RPD.
**Begründung:** Laut Modellseite stabil und «fastest, most cost-effective»; laut Preisseite in der Gratisstufe kostenlos. `gemini-2.5-flash` und `gemini-2.5-pro` sind abgekündigt (ab 1.12.2026 umgeleitet) und kommen nicht in Frage. Google veröffentlicht die Gratis-Limits nicht mehr in der Doku, nur in AI Studio; der Nutzer hat dort 15 RPM / 250K TPM / 500 RPD abgelesen (deckt sich mit Drittquellen) (Tageszähler wird um Mitternacht Pacific Time zurückgesetzt, Limit gilt pro Projekt). Bei 25 Mails pro Lauf und 8 Mails pro Anfrage reicht das weit. Das JSON-Schema erzwingt `maxLength` nicht → eigene Längenprüfung bleibt Pflicht (SPEC §2.6 Schritt 4). Modellname bleibt in `config` änderbar, weil Google Modelle häufig wechselt.
**Quelle:** https://aistudio.google.com/docs/models ; https://aistudio.google.com/docs/pricing ; https://aistudio.google.com/docs/rate-limits ; https://aistudio.google.com/docs/structured-output

## D5 – Datenschutz Gemini-Gratisstufe (2026-11-14)
**Entscheid:** Hinweis in SPEC §5 ergänzt. Bestehende Schutzmassnahmen (sensible Kategorien nie an die KI, max. 3000 Zeichen, abschaltbar) bleiben; Der Nutzer hat am 2026-11-14 zugestimmt: Standard `aiEnabled = true` (Volumen ~5 Mails/Tag).
**Begründung:** Die Preisseite markiert für alle Gratis-Modelle «Used to improve our products: Yes».
**Quelle:** https://aistudio.google.com/docs/pricing

## D6 – ntfy: JSON-Versand statt Header, 429 tolerieren (2026-11-14)
**Entscheid:** POST auf die Server-Wurzel mit JSON `{topic, title, message, priority, click, tags}`; optional `NTFY_TOKEN` als Bearer-Token; HTTP 429 → im nächsten `tick` erneut (max. 3×).
**Begründung:** ntfy unterstützt UTF-8 in Headern, «but not every library or programming language does» – Umlaute in Titeln sind bei uns die Regel. JSON-Publishing ist offiziell dokumentiert und umgeht das. ntfy.sh limitiert pro «Visitor» (IP): 60 Anfragen Burst, 250 Nachrichten/Tag; Apps Script ruft von geteilten Google-IPs aus auf, daher können fremde Skripte unser Limit mitverbrauchen. Ein Gratis-Konto mit Token ist die vorgesehene Abhilfe, falls das in Phase 1b auftritt. Nachricht max. 4096 Bytes.
**Quelle:** https://docs.ntfy.sh/publish/ (Abschnitte «Publish as JSON», «Limitations», «Message title»)

## D7 – Apps Script: Kontingente, Web-App, Cache (2026-11-14)
**Entscheid:** Werte in SPEC §2.4, §2.5, §2.9 bestätigt bzw. präzisiert; keine Architekturänderung.
**Begründung/Befund:** Gratis-Konten: Trigger 90 Min./Tag, 6 Min./Lauf, URL Fetch 20 000/Tag, Mail 20 000/Tag, 30 gleichzeitige Ausführungen. `executeAs: USER_DEPLOYING` und `access: ANYONE_ANONYMOUS` sind gültige Manifest-Werte. ContentService-Antworten kommen über eine Weiterleitung auf `script.googleusercontent.com` («ensure the HTTP client is configured to follow redirects»). CacheService: 100 KB pro Wert, Schlüssel ≤ 250 Zeichen, Ablauf ≤ 6 h. CORS-Verhalten (kein Preflight, `text/plain`) ist nicht offiziell dokumentiert → Bestätigung per Browser-Test in Phase 1a.
**Quelle:** https://developers.google.com/apps-script/guides/services/quotas ; https://developers.google.com/apps-script/manifest/web-app-api-executable ; https://developers.google.com/apps-script/guides/content ; https://developers.google.com/apps-script/reference/cache/cache

## D8 – Stundenplan per ICS-Abo, kein `importTimetable()` (2026-11-14)
**Entscheid:** Der abonnierte ICS-Kalender ist der Stundenplan-Kalender (`config.calLectures`). `setup()` legt nur den Prüfungs-Kalender an. `importTimetable()` entfällt im MVP.
**Begründung:** Der Nutzer hat getestet: Stundenplan als ICS-Abo funktioniert, eine zweite Quelle liefert denselben Plan. SPEC sah den Import nur als Notlösung vor.
**Quelle:** Testergebnis des Nutzers (private Notizen, Stand 2026-11-14).

## D9 – Abnahme Phase 2 ohne Lighthouse-PWA-Kategorie (2026-11-14)
**Entscheid:** Installierbarkeit wird in Chrome-DevTools (Application → Manifest, Service Worker) geprüft statt mit der Lighthouse-PWA-Prüfung.
**Begründung:** Lighthouse 12.0 hat die PWA-Kategorie entfernt.
**Quelle:** https://github.com/GoogleChrome/lighthouse/releases/tag/v12.0.0 ; https://developer.chrome.com/blog/update-install-criteria

## D10 – API-Vertrag: Ergänzungen zu SPEC §2.4 (2026-11-14)
**Entscheid:** `shared/api-types.ts` übernimmt die Typen aus SPEC §2.4 unverändert und ergänzt: `WidgetState` (mit `today: CalEvent[]` für die Tagesagenda des mittleren Widgets), `TodoPatch`, `ApiRequest`, `ApiResponse`, `ApiErrorCode`, `ApiActions`. TypeScript 7.0 (`strict`, `exactOptionalPropertyTypes`). Die Übereinstimmung mit `docs/mock-state.json` prüft `cd shared && npm test`.
**Begründung:** SPEC beschrieb `WidgetState` und das Patch-Format nur in Worten; SPEC §4 verlangt für das mittlere Widget eine Tagesagenda.

## D11 – Kein eigener Briefing-Trigger (2026-11-14)
**Entscheid:** Nur ein Trigger (`tick`, alle 10 Min.). `tick` verschickt das Briefing, sobald die Briefing-Zeit des Tages erreicht ist und es noch nicht gesendet wurde.
**Begründung:** Werktags und am Wochenende gelten verschiedene Zeiten (`briefingWeekday`, `briefingWeekend`); ein Tagestrigger kann nur eine feste Stunde. Genauigkeit ±10 Min. genügt, und ein Trigger weniger spart Laufzeit-Kontingent.

## D12 – Tests ohne `module.exports`, private Voreinstellungen (2026-11-14)
**Entscheid:** `src/lib` wird in den Tests per `vm`-Kontext geladen (wie der globale Scope von Apps Script). Persönliche Voreinstellungen liegen in der git-ignorierten Datei `backend/src/private.local.js`.
**Begründung:** So laufen die Dateien in Node und Apps Script unverändert, und Fehler durch die Ladereihenfolge fallen schon im Test auf (ist in Phase 1a einmal passiert). Die private Datei erlaubt einen vollständigen `setup()` ohne persönliche Daten im Repo.

## D13 – Speicherformat im Sheet (2026-11-14)
**Entscheid:** Datenbereiche aller Tabs sind als Nur-Text formatiert; beim Lesen werden Datum-, Zahl- und Wahrheitswerte trotzdem tolerant umgewandelt (`normalizeDateCell`, `toBool`). Die Spaltenreihenfolge ist fest; `setup()` bricht mit einer klaren Meldung ab, wenn Spalten vertauscht wurden, und ergänzt fehlende Spalten am Ende.
**Begründung:** Google Sheets wandelt «2026-11-20» sonst in ein Datum um. Der Nutzer pflegt Tabs (`regeln`, `config`) direkt; Lesen muss deshalb auch Werte vertragen, die Sheets selbst umgewandelt hat.

## D14 – HIG-Prinzipien in der PWA (2026-11-14)
**Entscheid:** Claudes ergänzte Gestaltungsvorgaben bleiben erhalten. Da der referenzierte lokale HIG-Skill fehlt, werden mit ausdrücklicher Zustimmung des Nutzers die offiziellen Apple-HIG direkt verwendet. iPhone: Tab-Leiste; iPad-Breiten 700–1099 px: Seitenleiste; ab 1100 px weiterhin das vereinbarte Dashboard. Bearbeitung erfolgt in einem Web-Dialog mit Fokusbindung und Rückkehr zum Auslöser, unten auf dem iPhone und zentriert auf dem iPad. Systemschrift und relative Textgrössen statt eingebetteter Apple-Schriftdateien; Icons aus Lucide statt SF Symbols.
**Begründung:** Die PWA übernimmt die übertragbaren Navigations-, Typografie- und Zugänglichkeitsprinzipien, ohne native Apple-APIs vorauszusetzen. Dies setzt SPEC §3.5 um und ändert die Architektur nicht.
**Quellen:** https://developer.apple.com/design/human-interface-guidelines/sidebars ; https://developer.apple.com/design/human-interface-guidelines/sheets ; https://developer.apple.com/design/human-interface-guidelines/typography ; https://developer.apple.com/design/human-interface-guidelines/accessibility

## D15 – Mailsuche ohne `-in:sent` (2026-11-14)
**Entscheid:** Suche `after:<Sync − 1 h> -in:drafts -in:spam -in:trash`; Nachrichten mit Label `SENT` ohne `INBOX` werden im Code übersprungen (2 h gemerkt, damit sie nicht jedes Mal neu geladen werden). Erster Lauf ohne Sync-Zeitpunkt: 3 Tage zurück. Mehr als 25 neue Mails: die ältesten 25 verarbeiten, Sync-Zeitpunkt nicht vorrücken.
**Begründung:** Eine Mail an die eigene Adresse trägt in Gmail `SENT` und `INBOX`; `-in:sent` würde sie verwerfen (Testmails, Notizen an sich selbst). Gmail akzeptiert für `after:` Sekunden seit 1970.

## D16 – Gmail-Labels und Stichwort-Regeln als Schutz vor der KI (2026-11-14)
**Entscheid:** Neben den Regeln gilt eine Mail auch dann als sensibel, wenn sie bereits ein Gmail-Label aus `config.sensitiveCategories` trägt. Die privaten Start-Regeln enthalten zuoberst Betreff-Stichwörter (Regex) für Gesundheit und Versicherung. Sensible Mails ohne feste Wichtigkeit erhalten importance 2. Für sensible Mails werden weder Kurzfassung noch Ausschnitt gespeichert. Ordnet die KI eine Mail nachträglich einer sensiblen Kategorie zu, wird sie ebenfalls als sensibel markiert (Push und To-do nur generisch).
**Begründung:** AGENTS.md Regel 4. Absender der Versicherungen sind noch nicht erfasst; die vorhandenen Gmail-Filter des Nutzers und Stichwörter decken die Lücke ab, bis die Absender-Regeln gepflegt sind.

## D17 – Idempotenz und neue Aktion `settings.update` (2026-11-14)
**Entscheid:** `quickAdd` nimmt eine optionale Client-UUID `id` an (bestehendes To-do wird zurückgegeben; ohne `id` wie bisher, kompatibel mit dem Siri-Kurzbefehl). `mail.toTodo` ist idempotent (bestehendes To-do der Mail oder ihres Threads). `mail.feedback` aktualisiert eine vorhandene Absender-Regel statt eine zweite anzulegen (`ruleAdded: false`). `mail.dismiss` ist idempotent. Neu ist `settings.update` (`Partial<Settings>` → `Settings`). `quickAdd` sperrt nur um den Schreibzugriff, damit der KI-Aufruf andere Schreibzugriffe nicht blockiert.
**Begründung:** Wünsche von Codex in OPEN-QUESTIONS.md; die Outbox der PWA wiederholt Aufträge nach unklarer Bestätigung.

## D18 – Ablauf von `tick`, Benachrichtigungen und Wiederholungen (2026-11-14)
**Entscheid:** `tick` verhindert Überlappungen mit dem Document Lock; Schreibzugriffe laufen kurz unter dem Script Lock, wie bei der API. Push-Meldungen laufen über eine Warteschlange in den Script Properties (`NOTIFY_QUEUE`, höchstens 30 Einträge, je höchstens 3 Versuche). Mails werden nur in der Ruhezeit zurückgehalten. Erinnerungen und Briefing gehen zur gesetzten Zeit hinaus. Erinnerungen mit mehr als 6 h Verspätung werden nur noch als erledigt markiert, nicht mehr gesendet. Für Mails, die älter als 24 h sind, gibt es keinen Push, etwa beim ersten Lauf. Neue Spalte `mails.aiAttempts` zählt KI-Versuche. Mails mit `classifiedBy: none`, die nicht sensibel sind, bleiben bis zu 3 Versuche lang und 14 Tage nach Empfang Kandidaten für die KI. Dazu gehören auch Mails, die bei abgeschalteter KI eingingen. Ungültige KI-Ergebnisse gelten als fehlgeschlagen. Zwei Antworten für dieselbe Mail werden beide verworfen. Eine Frist ausserhalb von heute bis +365 Tage wird nur entfernt, das übrige Ergebnis bleibt. Texte über der Grenze werden gekürzt, ab dem etwa Vierfachen gilt das Ergebnis als ungültig. Push-Texte enthalten nie KI-Ausgaben, nur Absender und Betreff.
**Begründung:** Ein KI-Aufruf dauert mehrere Sekunden und soll die PWA nicht mit `busy` blockieren. Die Regeln für Ruhezeit, Wiederholungen und Spalten präzisieren SPEC §2.6 und §2.8. Ohne Begrenzung der Push-Texte könnte eine manipulierte KI-Antwort Phishing-Text auf den Sperrbildschirm bringen.

## D19 – Telegram als Push-Kanal 1, ntfy als Reserve (2026-11-15)
**Entscheid:** Neuer Kanal `telegram` (Bot API `sendMessage`, reiner Text ohne `parse_mode`, ohne Linkvorschau, Priorität ≤ 2 ohne Ton). `config.pushChannels`: `auto` (Standard) nimmt Telegram, sobald `TELEGRAM_BOT_TOKEN` und `TELEGRAM_CHAT_ID` gesetzt sind, sonst ntfy. Eine Liste wie `telegram,ntfy` nutzt beide. Eine Meldung gilt als zugestellt, wenn mindestens ein Kanal Erfolg meldet. `telegramSetup()` (im Editor) übernimmt die Chat-ID aus `getUpdates` nach `/start`. Der Bot-Token steht nie im Log (er ist Teil der URL).
**Begründung:** ntfy.sh zählt Veröffentlichungen pro IP, auch mit Gratis-Konto und Token. Gemessen am 2026-11-15 über `/v1/account`: «limit basis ip, messages 250/250». Apps Script sendet von geteilten Google-IPs, deren Tageskontingent meist schon verbraucht ist (HTTP 429, Code 42908). Einzelne Meldungen kommen nur zufällig über eine andere IP durch. Ein Abo bei ntfy widerspricht dem 0-CHF-Ziel. Telegram ist kostenlos und wird pro Bot begrenzt, nicht pro IP. Gewählt vom Nutzer am 2026-11-15. Telegram-Bot-Nachrichten sind wie ntfy nicht Ende-zu-Ende-verschlüsselt. Es gelten deshalb dieselben Regeln: nur Absender und Betreff, sensible Mails nur mit Kategorie.
**Quelle:** https://docs.ntfy.sh/publish/ (Limitations) ; https://core.telegram.org/bots/api#sendmessage ; https://core.telegram.org/bots/api#getupdates

## D20 – Wetter mit Kleidungsempfehlung im Briefing, Standort vom iOS-Kurzbefehl (2026-11-15)
**Entscheid:** Das Backend fragt beim Briefing Open-Meteo direkt ab (Abweichung von SPEC §3.4, dort holen nur die Clients das Wetter). Die Empfehlung entsteht nach festen Regeln, nicht über die KI. Orte: Wohnort (`lat`/`lon`, `homeName`) und Campus (`campusLat`/`campusLon`, `campusName`) im Tab `config`, auf Ortschaftsebene, nicht die Strassenadresse. Neue Aktion `location.update`: Ein iOS-Kurzbefehl meldet den Standort automatisch. Gespeichert wird nur der letzte Wert, auf 2 Dezimalstellen gerundet (~1 km), in der Script Property `LOCATION`. Er gilt 12 h und erscheint nicht im State; das Log vermerkt nur «location updated», ohne Koordinaten oder Ort. Ohne gültigen Standort gilt der Wohnort. Neue Aktion `briefing.preview` zum Prüfen ohne Versand.
**Begründung:** Wunsch des Nutzers am 2026-11-15: Kleidungsempfehlung wochentags für Weg und Campus, am Wochenende das Wetter am Aufenthaltsort, ohne eigene Eingabe. Regeln statt KI: zuverlässig, testbar und ohne Kontingent. Open-Meteo braucht keinen Schlüssel und ist aus Apps Script erreichbar (live geprüft 2026-11-15). Fällt Open-Meteo aus, geht das Briefing ohne Wetter hinaus. Ob der Kurzbefehl auf dem gesperrten iPhone den Standort liefert, ist auf dem Gerät zu prüfen. Fällt er aus, gilt der Wohnort, das Briefing bleibt vollständig.
**Quelle:** https://open-meteo.com/en/docs ; https://support.apple.com/guide/shortcuts/apdfbdbd7123/

## D21 – Widgets ohne ÖV (2026-11-15)
**Entscheid:** Das kleine Widget zeigt statt der nächsten Abfahrt die wichtigste Mail und die nächsten To-dos; der Sperrbildschirm zeigt den nächsten Termin und das nächste To-do. Die Widgets fragen keine ÖV-Daten ab. Die ÖV-Karte in der PWA bleibt.
**Begründung:** Wunsch des Nutzers: ÖV ist ihm weniger wichtig, To-dos und wichtige Mails sollen auf einen Blick sichtbar sein. Weniger externe Abfragen machen das Widget einfacher und robuster.

## D22 – Schnellerfassung als To-do oder Termin (`capture`), feste Regeln für ungenaue Daten (2026-11-15)
**Entscheid:** Neue Aktion `capture` `{text, id?, dryRun?}`. Die KI entscheidet, ob der Satz ein To-do oder ein Termin ist, und liefert die Felder. Termine kommen in den Kalender `config.calCapture`, ist dieser leer, in den Standardkalender. Ohne Uhrzeit gilt der Termin ganztägig, ohne Ende dauert er 60 Min., ohne Datum wird er zum To-do. Ungenaue Angaben folgen festen Regeln, die im Code berechnet und der KI als Tabelle mitgegeben werden: «nächste Woche» = Montag, «Anfang/Mitte/Ende nächste Woche» = Montag/Mittwoch/Freitag, «übernächste Woche» = Montag in zwei Wochen, «Ende Woche»/«diese Woche» = Freitag (am Wochenende der kommende), «Wochenende» = Samstag, «nächsten Monat» = 1. des Folgemonats, «Ende Monat» = letzter Tag. «nächste Woche» meint immer die kommende Kalenderwoche, auch am Wochenende (Sonntag → Montag am Tag darauf; vom Nutzer am 2026-11-15 bestätigt). Wer den Montag eine Woche später meint, sagt «Montag in einer Woche» (= nächster solcher Wochentag + 7 Tage, für alle Wochentage). Ohne KI oder bei sensiblem Text: To-do mit dem ganzen Text und dem Datum aus diesen Regeln. Termine sind mit `id` idempotent (Ergebnis 6 h im Cache), To-dos über ihre ID. `dryRun` liefert nur die Vorschau. `quickAdd` bleibt vertraglich unverändert (immer `Todo`) und nutzt denselben Parser.
**Begründung:** Wunsch des Nutzers vom 2026-11-15: ein kurzer Satz soll als To-do oder Termin im Kalender landen. Regeln für ungenaue Daten vom Nutzer festgelegt («nächste Woche» = Montag, «Ende nächste Woche» = Freitag). Termine im Google-Kalender erscheinen auch im iOS-Kalender mit dessen Erinnerungen (SPEC: keine eigenen Termin-Erinnerungen). Ein eigener Rückgabetyp statt einer Änderung an `quickAdd` hält bestehende Clients kompatibel.
