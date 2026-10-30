# Changelog

Fachliche Verhaltensänderungen von cevi.db (hitobito), die beim Anpassen der E2E-Tests aufgefallen sind.

## Release 2026-11 (hitobito `45c2ca9f`, hitobito_cevi `7f3fce3`, hitobito_youth `08df1d7`)

- **Zusätzliche Adressen für Personen und Gruppen sind aktiviert** (hitobito/hitobito#4471). Im Bearbeiten-Formular (bei Gruppen im Tab "Kontaktangaben") gibt es den neuen Block "Weitere Adressen" mit Kategorie (Person: Arbeit/Rechnungsadresse/Andere, Gruppe: Rechnungsadresse/Andere), Öffentlich-Checkbox, "Namen übernehmen" und Adressfeldern. Auf der Detailseite erscheinen sie direkt nach der Hauptadresse, vor den E-Mail-Adressen, mit der Kategorie darunter.
- **Bekannter Fehler:** Die freie "Bezeichnung" einer zusätzlichen Adresse wird beim Speichern verworfen – `Contactable::ACCESSIBLE_ATTRS` erlaubt noch `:translated_label` statt `:label` (Überbleibsel aus hitobito/hitobito#4359, gemeldet als hitobito/hitobito#4609).

## Release 2026-10 (hitobito `3b88f1a4`, hitobito_cevi `e96ec777`, hitobito_youth `98b6deb0`)

- **Anlässe/Kurse brauchen eine Kontaktperson mit E-Mail-Adresse.** Ohne sie schlägt das Speichern fehl ("Kontaktperson mit gültiger E-Mail-Adresse muss vorhanden sein, da Antworten auf E-Mails zum Anlass an diese Adresse gesendet werden."). Die Adresse wird als Reply-To für Anlass-Mails verwendet (hitobito_cevi `cb750ab`, hitobito/hitobito#2881).
- **Gruppe löschen verlangt eine Bestätigung durch Eintippen des Gruppennamens** in einem Modal ("Gruppen und Rollen definitiv löschen") statt eines einfachen Bestätigungsdialogs.
