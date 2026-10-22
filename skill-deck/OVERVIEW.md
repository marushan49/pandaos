# Skill Deck

Zeigt die Plugins und Skills des ausgewählten Hosts. Wähle ein Projekt, um zusätzlich dessen Skills zu sehen. Suche nach Namen, Provider oder Beschreibung und öffne ein Modul für seinen Inhalt, seine Pfade und seine Quelle.

Die Update-Prüfung liest Git- und npm-Quellen, ohne Updates zu installieren. Lokale Quellen ohne bekannten Ursprung bleiben als solche erkennbar. Identische Symlinks werden zusammengefasst. Namenskollisionen, defekte Links und mögliche Überschneidungen zeigen ihre Fundstellen; semantische Widersprüche sind damit nicht bewiesen.

Die Nutzungsansicht zählt beobachtete Skill-Aufrufe und Datei-Lesezugriffe ab Aktivierung des Plugins, nach Provider. Automatisch geladene Skills und Zugriffe außerhalb beobachteter PandaOS-Sessions können fehlen. Gespeichert werden Zähler und Zeitpunkte, keine Gesprächsinhalte.

Der Pluginprozess liest lokale Skill-Dateien und Installationsmetadaten. Die Pluginliste und deren Update-Prüfung verwenden die PandaOS-CLI auf demselben Host. Ein anderer Host braucht eine eigene Installation. Die Hostwahl bleibt in der Kopfzeile von PandaOS.
