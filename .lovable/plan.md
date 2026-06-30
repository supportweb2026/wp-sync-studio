## Problème
Le build Apify échoue maintenant avec une erreur de validation du schéma d’input :

```text
.apify-actor Field schema.properties.mode.description is required
```

Le champ `mode` dans `apify-actor/.actor/input_schema.json` n’a pas de propriété `description`.

## Plan
1. Ajouter `"description"` au champ `mode` (et aux autres champs pour éviter d’éventuelles erreurs similaires).
2. Vérifier que le JSON reste valide.
3. Demander à l’utilisateur de relancer le build Apify.

## Fichier modifié
- `apify-actor/.actor/input_schema.json`

## Détail de la modification
Le champ `mode` deviendra :

```json
"mode": {
  "title": "Mode",
  "description": "Run mode: publish an article or just check the WordPress login",
  "type": "string",
  "editor": "select",
  "enum": ["publish", "login-check"],
  "default": "publish"
}
```

Les autres champs recevront également une description pour anticiper les règles de validation Apify.

## Après modification
Relancer le build depuis Apify (ou refaire `apify push` si tu déploies via CLI) pour confirmer que l’erreur de schéma disparaît.