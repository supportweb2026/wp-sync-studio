## Problème identifié

Le log Apify s’arrête à `Début du conteneur` / `LIMITED_PERMISSIONS`, sans atteindre les logs `[actor]`. Cela indique très probablement que l’Actor plante au démarrage Node/TypeScript, avant même la connexion WordPress.

La cause la plus probable dans le code actuel est la configuration de build de l’Actor :

- `package.json` lance en dev `node --import tsx/esm src/main.ts`
- mais le Dockerfile compile avec `tsc`, puis exécute `node dist/main.js`
- `tsconfig.json` utilise `moduleResolution: "Bundler"` avec `module: "ES2022"`
- les imports TypeScript utilisent déjà des extensions `.js`, donc il faut une config Node ESM compatible Apify/Node, pas une résolution Bundler

## Plan de correction

1. Corriger la compilation Node ESM de l’Actor
   - Passer `tsconfig.json` sur une résolution Node moderne compatible runtime : `module: "NodeNext"` et `moduleResolution: "NodeNext"`.
   - Garder la sortie `dist/main.js`, utilisée par le Dockerfile.

2. Simplifier le script de démarrage local de l’Actor
   - Remplacer `node --import tsx/esm src/main.ts` par une commande plus standard compatible ESM/tsx.
   - Conserver `npm run build` pour la compilation Docker.

3. Ajouter des logs de démarrage très précoces
   - Loguer immédiatement que l’Actor démarre, que l’input est lu, puis que le navigateur est lancé.
   - Ainsi, si Apify échoue encore, le journal dira précisément si le crash arrive avant input, avant Playwright, au login, ou à la publication.

4. Rendre le lancement navigateur plus compatible avec l’image Apify
   - Utiliser le navigateur fourni par l’image Playwright/Apify, avec options sûres pour conteneur.
   - Éviter que le crash soit causé par Chromium au lancement.

5. Vérifier le typage localement sans publier
   - Exécuter uniquement la vérification/compilation de l’Actor après modification.
   - Si ça compile, il faudra ensuite redéployer l’Actor avec `apify push` pour que `sodepsi/wp-sync-studio` utilise la version corrigée.

## Résultat attendu

Après redéploiement de l’Actor, le run Apify ne doit plus échouer silencieusement au démarrage. S’il échoue encore côté WordPress/Sucuri/login/upload, le journal affichera enfin l’étape exacte et l’erreur exploitable.