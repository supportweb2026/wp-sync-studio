# wp-site-b-publisher (Apify Actor)

Actor Apify qui automatise le back-office WordPress du Site B (bloqué par Sucuri en REST) pour publier une Actualité via Playwright.

## Déploiement

```bash
npm i -g apify-cli
cd apify-actor
apify login          # avec votre token Apify
apify push           # build + déploiement
```

Une fois poussé, récupérez l'identifiant `username~wp-site-b-publisher` et ajoutez-le dans Lovable sous le secret `APIFY_ACTOR_ID`.

## Input attendu

Voir `.actor/input_schema.json`. Tous les secrets (URL, identifiants WP) sont passés à chaque run par l'app Lovable — ils ne sont jamais stockés dans l'Actor.

## Output

L'Actor pousse un seul item dans le dataset :

```json
{ "ok": true, "skipped": false, "postUrl": "...", "postId": 123 }
```

ou en cas d'échec :

```json
{ "ok": false, "error": "message lisible" }
```

## Étapes Playwright

1. Login `/{loginPath}` → attente de `#wpadminbar`.
2. Vérifie le slug dans `edit.php?post_type={cptSlug}` (dédoublonnage).
3. Crée ou met à jour l'article dans `post-new.php` / `post.php?action=edit`.
4. Upload image mise en avant si fournie.
5. Tag + date si fournis.
6. Publier, attendre la confirmation, extraire URL/ID.
7. Toujours fermer le navigateur en `finally`.
