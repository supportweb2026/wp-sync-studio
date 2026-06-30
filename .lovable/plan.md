## Objectif

Remplacer l'idée Playwright local par **Apify** : un Actor cloud automatise un navigateur sur le back-office WordPress du Site B (bloqué par Sucuri en REST). L'app Lovable déclenche l'Actor via l'API Apify et récupère le résultat.

## Architecture

```text
App Lovable (TanStack Server Fn)
        │  fetch HTTPS
        ▼
Apify API  ──▶ Actor "wp-site-b-publisher" (Node + Playwright)
                       │
                       ▼
              Admin WordPress Site B
```

- Site A : lecture inchangée via REST.
- Site B : publication via Apify Actor (login admin + création article).
- Aucune dépendance Playwright dans le repo Lovable.
- Tous les secrets sont stockés côté serveur (Lovable Cloud + Apify).

## Secrets (déjà saisis)

- `SITE_B_URL`, `SITE_B_USERNAME`, `SITE_B_PASSWORD`, `APIFY_API_TOKEN`.

## Ce qui sera fait côté Lovable (ce repo)

1. **Server function `publishToSiteB`** (`src/lib/site-b/apify.functions.ts`)
   - Authentifiée via `requireSupabaseAuth`.
   - Entrée Zod : `{ title, slug, content, excerpt?, tagSlug?, date?, featuredImageUrl? }`.
   - Lit `APIFY_API_TOKEN`, `SITE_B_URL/USERNAME/PASSWORD` depuis `process.env`.
   - Appelle `POST https://api.apify.com/v2/acts/{ACTOR_ID}/run-sync-get-dataset-items` avec l'input.
   - Renvoie `{ ok, postUrl?, postId?, error? }`.
   - Timeout long (jusqu'à 5 min), logs propres, erreurs typées.

2. **Server function `getApifyRunStatus`** (optionnel)
   - Pour suivre un run async si l'article est long à publier.

3. **Table Supabase `site_b_publications`** (migration)
   - `id, user_id, source_post_id, apify_run_id, status, post_url, error, created_at`.
   - RLS + GRANT standards.

4. **Intégration pipeline migration**
   - Dans `pipeline.server.ts`, ajout d'un mode `destinationDriver: "apify"`.
   - Si actif : au lieu d'appeler `createPost` REST sur le Site B, on appelle `publishToSiteB`.
   - Stratégie doublon (skip/overwrite/copy) déléguée à l'Actor via un flag d'input.

5. **UI Migration**
   - Sélecteur "Driver Site B : REST / Apify".
   - Affichage du `postUrl` retourné et du `apify_run_id` pour debug.

## Ce qui sera fait côté Apify (hors repo)

Un Actor Node.js + Playwright à publier sur le compte Apify de l'utilisateur. Livré comme dossier `apify-actor/` dans le repo pour qu'il puisse le déployer via `apify push`.

Structure :

```text
apify-actor/
  .actor/
    actor.json
    input_schema.json
    Dockerfile
  src/
    main.ts
    login.ts
    createPost.ts
    uploadImage.ts
    selectors.ts
  package.json
  tsconfig.json
```

Input schema (passé par Lovable au run) :

```json
{
  "siteUrl": "string",
  "username": "string",
  "password": "string",
  "loginPath": "/wp-admin",
  "cptSlug": "actualite",
  "article": {
    "title": "string",
    "slug": "string",
    "content": "string (HTML)",
    "excerpt": "string?",
    "tagSlug": "string?",
    "date": "ISO string?",
    "featuredImageUrl": "string?"
  },
  "duplicateStrategy": "skip | overwrite | copy"
}
```

Étapes Actor :

1. Lancer Chromium headless avec UA réaliste (Sucuri-friendly).
2. Ouvrir `siteUrl + loginPath`, remplir `#user_login` / `#user_pass`, attendre `#wpadminbar`.
3. Aller sur `edit.php?post_type={cptSlug}` pour vérifier slug existant.
4. Si doublon + `skip` → renvoyer `{ skipped: true }`.
5. Sinon ouvrir `post-new.php?post_type={cptSlug}`.
6. Détecter Gutenberg vs Classic, remplir titre / slug / contenu.
7. Si `featuredImageUrl` : télécharger l'image, l'uploader via la médiathèque, la définir en image mise en avant.
8. Définir tag et date si fournis.
9. Cliquer "Publier", attendre confirmation, extraire l'URL publique et l'ID.
10. Pousser le résultat dans le dataset Apify ; toujours fermer le navigateur en `finally`.

Tous secrets passés en input du run, jamais loggés.

## Étapes de mise en œuvre

1. Créer la migration `site_b_publications` + GRANT/RLS.
2. Créer `src/lib/site-b/apify.functions.ts` (`publishToSiteB`).
3. Brancher le driver Apify dans `pipeline.server.ts`.
4. Mettre à jour l'UI Migration (sélecteur driver + résultat).
5. Scaffolder `apify-actor/` (Actor TypeScript prêt à `apify push`).
6. Documenter dans `apify-actor/README.md` : `npm i -g apify-cli`, `apify login`, `apify push`, récupérer l'`ACTOR_ID` et l'ajouter en secret `APIFY_ACTOR_ID`.

## Secret supplémentaire à ajouter après déploiement Actor

- `APIFY_ACTOR_ID` (ex. `username~wp-site-b-publisher`). Sera demandé après que vous aurez fait `apify push`.

## Hors périmètre

- Pas d'exécution Playwright dans Lovable.
- Pas de queue de jobs custom (le run Apify est synchrone via `run-sync-get-dataset-items`).
- Pas de gestion multi-Site B (un seul Site B par utilisateur dans v1).