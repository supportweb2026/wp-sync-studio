## Problème

L'Actor démarre bien (le bootstrap fonctionne, l'input est lu), mais Playwright plante au lancement du navigateur :

```
Executable doesn't exist at /pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell
```

L'image de base `apify/actor-node-playwright-chrome:20` embarque déjà Playwright **et** un Chromium pré-installé à une version précise. En ajoutant `playwright: ^1.48.0` dans `apify-actor/package.json`, npm installe une autre version de Playwright qui cherche un binaire Chromium (build `1228`) qui n'existe pas dans l'image. Résultat : Playwright trouvé, Chromium introuvable.

## Correction

Une seule modification : **arrêter de réinstaller Playwright**, utiliser celui de l'image.

### `apify-actor/package.json`
- Retirer `playwright` des `dependencies` (l'image le fournit déjà avec le bon Chromium).
- Garder `apify` et `typescript`.

### Pas d'autre changement nécessaire
- Le code source continue d'importer `playwright` normalement : Node le résout via le `node_modules` global de l'image.
- Le Dockerfile reste identique.
- `tsconfig.json` reste identique.

## Vérification

Après push GitHub → rebuild Apify → relancer un run `mode=login-check`. Les logs doivent montrer :
- `[actor] Navigateur Playwright lancé`
- puis l'étape de login WordPress.

Si jamais TypeScript râle au build parce qu'il ne trouve plus les types `playwright`, on ajoutera `@types/node` côté `dependencies` (les types Playwright sont fournis par le package lui-même, présent dans l'image). En cas de problème de résolution, le repli est d'ajouter `"playwright": "*"` en `peerDependencies` pour la doc, sans le réinstaller.

## Étape côté utilisateur

1. Lovable applique le changement à `apify-actor/package.json`.
2. Push GitHub (déclenche le rebuild Apify automatiquement).
3. Sur `/migration`, cliquer **Tester la connexion**.
