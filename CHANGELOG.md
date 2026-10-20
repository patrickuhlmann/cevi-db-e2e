# Changelog

Fachliche Verhaltensänderungen von cevi.db (hitobito), die beim Anpassen der E2E-Tests aufgefallen sind.

## Release 2026-10 (hitobito `3b88f1a4`, hitobito_cevi `e96ec777`, hitobito_youth `98b6deb0`)

- **Anlässe/Kurse brauchen eine Kontaktperson mit E-Mail-Adresse.** Ohne sie schlägt das Speichern fehl ("Kontaktperson mit gültiger E-Mail-Adresse muss vorhanden sein, da Antworten auf E-Mails zum Anlass an diese Adresse gesendet werden."). Die Adresse wird als Reply-To für Anlass-Mails verwendet (hitobito_cevi `cb750ab`, hitobito/hitobito#2881).
- **Gruppe löschen verlangt eine Bestätigung durch Eintippen des Gruppennamens** in einem Modal ("Gruppen und Rollen definitiv löschen") statt eines einfachen Bestätigungsdialogs.
