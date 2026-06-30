# Plan : Apify Actor + nettoyage interface

## 1. Clarifier ce qu'est l'Actor Apify et comment le déployer

L'Actor Apify n'est pas un fichier unique, c'est le dossier `apify-actor/` présent dans le projet Lovable. Il contient :
- `src/main.ts` — orchestre Playwright côté Apify.
- `src/login.ts`, `findBySlug.ts`, `createPost.ts`, `uploadImage.ts` — étapes WordPress.
- `.actor/actor.json` + `.actor/input_schema.json` — configuration Apify.
- `package.json` + `README.md`.

**Déploiement** (3 commandes) :
```bash
npm i -g apify-cli
apify login              # colle ton token Apify
apify push               # depuis le dossier apify-actor/
```

Lovable n'a pas encore de "zip" à télécharger : tu peux copier ce dossier en local, ou je peux générer une archive exportable. Après `apify push`, Apify affiche l'identifiant `username~wp-site-b-publisher` — c'est cette valeur qu'il faut coller dans Lovable comme secret `APIFY_ACTOR_ID`.

## 2. Nettoyer la page Migration

Tu as raison : l'aperçu actuel mélange des options de l'ancienne migration REST/Playwright local qui n'ont plus lieu d'être pour le workflow Site B.

Je propose de simplifier `src/routes/_authenticated/migration.tsx` :
- ** Garder** : sélection d'articles depuis la comparaison, bouton "Publier sur Site B via Apify", tableau de résultats.
- ** Supprimer / déplacer** :
  - Les options "Conserver le slug / date / statut / extrait / image principale / images du contenu" : elles ne concernent pas la publication via admin WordPress (l'Actor gère son propre formatage).
  - Le bouton "Lancer via REST" : la migration REST vers Site B est abandonnée ; garder uniquement "Apify".
- ** Ajouter** : une bannière explicative "Site B est protégé par Sucuri : les articles sont publiés via Apify (Playwright cloud)".
- ** Améliorer** : afficher l'ID de l'Actor et l'état de la configuration `APIFY_ACTOR_ID` pour savoir si l'app est prête à lancer.

## 3. Mise à jour de la doc et des vérifications

- Réécrire `apify-actor/README.md` avec les commandes exactes et un exemple de `APIFY_ACTOR_ID`.
- Ajouter une vérification côté serveur : si `APIFY_ACTOR_ID` est absent, la fonction `runSiteBApifyBatch` retourne un message clair "Actor non configuré" au lieu d'une erreur 500.

## 4. Prochaine étape côté toi

Après le plan, tu n'as plus qu'à :
1. Copier/exporter le dossier `apify-actor/`.
2. Lancer les 3 commandes ci-dessus.
3. Copier l'ID de l'Actor et me le donner pour que je l'enregistre comme secret `APIFY_ACTOR_ID`.