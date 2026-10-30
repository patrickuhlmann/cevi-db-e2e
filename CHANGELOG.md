# Changelog

Fachliche Verhaltensänderungen von cevi.db (hitobito), die beim Anpassen der E2E-Tests aufgefallen sind.

## Release 2026-11 (hitobito `45c2ca9f`, hitobito_cevi `7f3fce3`, hitobito_youth `08df1d7`)

- **Zusätzliche Adressen für Personen und Gruppen sind aktiviert** (hitobito/hitobito#4471). Im Bearbeiten-Formular (bei Gruppen im Tab "Kontaktangaben") gibt es den neuen Block "Weitere Adressen" mit Kategorie (Person: Arbeit/Rechnungsadresse/Andere, Gruppe: Rechnungsadresse/Andere), Öffentlich-Checkbox, "Namen übernehmen" und Adressfeldern. Auf der Detailseite erscheinen sie direkt nach der Hauptadresse, vor den E-Mail-Adressen, mit der Kategorie darunter.
- **Kanton ist ein Core-Attribut der Person** (hitobito_oeku#12, hitobito/hitobito#4481, hitobito_cevi `85ad745`). Statt des bisherigen Cevi-eigenen Feldes gibt es eine Auswahlliste der 26 Kantone, die im Formular nur bei der Hauptadresse und nur bei Land "Schweiz" erscheint. Wird ein anderes Land gewählt, wird der Kanton geleert. Zusätzliche Adressen und Gruppen haben keinen Kanton. Auf der Personen-Detailseite (Cevi-Angaben) steht die Zeile "Kanton" weiterhin, ohne Wert leer. Bestehende Werte wurden migriert (Freitext → Kürzel, ungültige Werte gelöscht, fehlende per PLZ ergänzt).
- **Bekannter Fehler:** Ist bei einer Person kein Land gesetzt, behandelt hitobito sie als Schweizer (Kanton erlaubt und wird angezeigt), das Formular blendet das Kantonsfeld aber aus. Ein gesetzter Kanton ist dann sichtbar, aber nicht bearbeitbar, solange man nicht explizit "Schweiz" wählt. Betrifft vor allem migrierte Cevi-Personen mit Kanton, aber ohne Land.
- **Bekannter Fehler:** Die freie "Bezeichnung" einer zusätzlichen Adresse wird beim Speichern verworfen – `Contactable::ACCESSIBLE_ATTRS` erlaubt noch `:translated_label` statt `:label` (Überbleibsel aus hitobito/hitobito#4359, gemeldet als hitobito/hitobito#4609).

## Release 2026-10 (hitobito `3b88f1a4`, hitobito_cevi `e96ec777`, hitobito_youth `98b6deb0`)

- **Anlässe/Kurse brauchen eine Kontaktperson mit E-Mail-Adresse.** Ohne sie schlägt das Speichern fehl ("Kontaktperson mit gültiger E-Mail-Adresse muss vorhanden sein, da Antworten auf E-Mails zum Anlass an diese Adresse gesendet werden."). Die Adresse wird als Reply-To für Anlass-Mails verwendet (hitobito_cevi `cb750ab`, hitobito/hitobito#2881).
- **Gruppe löschen verlangt eine Bestätigung durch Eintippen des Gruppennamens** in einem Modal ("Gruppen und Rollen definitiv löschen") statt eines einfachen Bestätigungsdialogs.
