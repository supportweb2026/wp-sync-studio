Objectif : faire en sorte que l’Actor Apify démarre toujours avec des logs exploitables, puis publie réellement l’article Site A vers Site B.

Plan d’implémentation ciblé :

1. Remplacer le démarrage actuel par un bootstrap minimal
   - Créer un point d’entrée très simple qui logue immédiatement au lancement du conteneur.
   - Charger ensuite le vrai code de publication avec un import dynamique.
   - Résultat : si `apify`, `playwright`, TypeScript/ESM ou un import interne plante, l’erreur sera capturée et visible dans Apify au lieu de s’arrêter à `LIMITED_PERMISSIONS`.

2. Séparer le code principal de l’Actor
   - Déplacer la logique actuelle de `main.ts` dans un module interne dédié.
   - Garder `main.ts` comme bootstrap robuste.
   - Cela évite qu’un import statique plante avant le premier `console.log`.

3. Durcir le Dockerfile Apify
   - Vérifier pendant le build que les fichiers compilés existent bien dans `dist`.
   - Exécuter explicitement `node ./dist/main.js`.
   - Ajouter un `npm prune --omit=dev` après build pour garder l’image propre mais conserver les dépendances runtime nécessaires.

4. Corriger la configuration Apify si nécessaire
   - Vérifier que le Dockerfile est bien référencé depuis `.actor/actor.json`.
   - Garder une image Apify Playwright compatible Node 20.

5. Vérifier avant de te redemander `apify push`
   - Compiler uniquement le sous-projet `apify-actor`.
   - Confirmer que le build produit bien `dist/main.js` et le module interne.
   - Ensuite seulement, tu devras refaire :

```bash
cd apify-actor
apify push
```

Après ça, si le problème vient encore de WordPress/Sucuri/login/upload, le journal affichera enfin l’étape exacte. Mais le blocage silencieux à `LIMITED_PERMISSIONS` sera éliminé.