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
