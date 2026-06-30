## Problème

Le build Apify échoue à l'étape `npm run build` avec `sh: 1: tsc: not found`.

La cause : l'image de base `apify/actor-node-playwright-chrome:20` définit `NODE_ENV=production`, donc `npm install` ignore les `devDependencies` (où se trouve `typescript`). Résultat : `tsc` n'est jamais installé, le build TypeScript plante.

## Correction

Deux petites modifications dans `apify-actor/` :

1. **`apify-actor/package.json`** — déplacer `typescript` (et `tsx` si conservé) de `devDependencies` vers `dependencies`, pour qu'ils soient toujours installés même en mode production.

2. **`apify-actor/.actor/Dockerfile`** — remplacer `npm install` par `npm ci --include=dev` (ou `npm install --include=dev`) avant le build, puis garder le `npm prune --omit=dev` final pour alléger l'image runtime. Cela garantit que `tsc` existe au moment du build, puis disparaît du conteneur final.

## Vérification

Après ces deux changements, faire un nouveau build sur Apify (auto-déclenché par le push GitHub). Les logs doivent montrer :
- `npm ci` qui installe `typescript`
- `tsc -p tsconfig.json` qui réussit
- `ls -la dist` qui liste `main.js` et `actor.js`
- Build terminé sans erreur

Ensuite, lancer un run `mode=login-check` pour vérifier que l'Actor démarre vraiment cette fois.
