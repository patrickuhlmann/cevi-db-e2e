* Neu erstellte Tests jeweils ausführen um sicherzustellen, dass diese funktionieren
* Neue Testpersonen/Testdaten die bereits existieren müssen und nicht selber angelegt werden im README.md beschreiben
* An sinnvollen Stellen (nach wichtigen Assertions) Screenshots erstellen: `await page.screenshot({ path: 'screenshots/name.png' })`. Benennung: `{spec}_{schritt}.png`, z.B. `rechnungen_erstellt.png`. Screenshots gehen nach `e2e/screenshots/` und werden bei jedem Lauf überschrieben (immer aktueller Stand). Zweck: manuelle visuelle Prüfung nach automatischer Ausführung.

## Eigenheiten der cevi.db

### Formularfelder

`getByLabel('Name')` ist nicht eindeutig – das Gruppenformular hat mehrere Felder die auf "Name" matchen (Name, Kurzname, SMS Benutzername). Immer `#group_name` verwenden:
```typescript
await page.locator('#group_name').fill(name);
```

### Gruppe löschen

Der Löschen-Link ist im "Bearbeiten"-Dropdown versteckt, das nur ein Caret-Toggle (kein sichtbarer Text) hat. Erst Toggle öffnen, dann Löschen klicken:
```typescript
await page.locator('#dropdown_group_edit a.dropdown-toggle').click();
page.once('dialog', (dialog) => dialog.accept());
await page.getByRole('link', { name: /^Löschen$/i }).click();
```

### Seitentitel

Die Seite hat zwei `<h1>`: Umgebungs-Banner + eigentlicher Titel. Immer den ersten in `main` ansprechen:
```typescript
await expect(page.locator('main h1, #main-content h1').first()).toContainText('...');
```

### Flash-Meldungen

```typescript
await expect(page.locator('#flash .alert-success')).toContainText(/gelöscht/);
await expect(page.locator('#flash .alert-danger')).toContainText('...');
```
Nicht `.alert` allein – auf jeder Seite gibt es globale Banner (Download, MailChimp).

### Untergruppen auf Gruppendetailseite

Untergruppen erscheinen im `#main`-Bereich (rechte Spalte der Infoansicht), nicht in `main`. Bei Link-Assertions:
```typescript
await expect(page.locator('#main').getByRole('link', { name: 'Gruppenname' })).toBeVisible();
```

### Bestätigungsdialoge

Hitobito verwendet native Browser-`confirm()`-Dialoge (via Turbo `data-confirm`):
```typescript
page.once('dialog', (dialog) => dialog.accept());
await page.getByRole('link', { name: /Löschen/i }).click();
```

### Session-Rotation bei Impersonation

Nach Impersonation rotiert Rails die Session-ID. Test muss am Schluss Imitation beenden und Session neu speichern:
```typescript
await page.getByRole('link', { name: 'Imitation beenden' }).click();
await page.context().storageState({ path: AUTH_FILE });
```