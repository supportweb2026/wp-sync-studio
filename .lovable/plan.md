## Objectif

Recentrer l'app sur **"voir les articles du Site A et les publier sur Site B via Apify"**, sans s'occuper de la comparaison ni de l'auteur, et en transférant bien les images.

---

## 1. Supprimer la logique de comparaison

- **Menu** (`src/components/layout/AppShell.tsx`) : renommer "Articles & comparaison" en **"Articles Site A"**.
- **Route** `src/routes/_authenticated/comparison.tsx` : transformer en simple **liste des articles Site A** (titre, slug, date, image à la une, statut) avec :
  - colonne d'action **"Publier sur Site B"** par ligne,
  - cases à cocher + bouton **"Publier la sélection sur Site B"**,
  - **plus aucun appel à Apify list-posts** ni colonne "état dans B".
- **`src/lib/wordpress/wp.functions.ts`** : remplacer `fetchComparison` par `listSourcePosts` (lit uniquement Site A via REST, ne touche jamais Site B).
- **`src/services/comparison/matcher.ts`** et `hash.ts` : devenus inutiles → suppression.
- **`src/lib/site-b/apify-batch.functions.ts`** : retirer le scope `"missing"` (qui appelait `runApifyListPosts`). Garder uniquement la publication d'une liste d'IDs sélectionnés (+ option "tous les articles Site A").
- **`src/lib/site-b/apify-internal.server.ts`** : supprimer `runApifyListPosts` et la branche `list-posts` côté Actor (`apify-actor/.actor/input_schema.json`, `apify-actor/src/main.ts`, `types.ts`).
- **Dashboard** : retirer toute mention "absents de B / présents dans B".

## 2. Rendre le flux A → B explicite dans l'UI

Sur la page **Articles Site A** :
- bandeau d'aide en haut : *"Cochez les articles puis cliquez « Publier sur Site B ». Chaque article est envoyé via Apify (login admin WP, création de l'article, upload image à la une)."*
- bouton principal **"Publier la sélection sur Site B"** (utilise `runSiteBApifyBatch` avec les IDs cochés).
- bouton secondaire **"Tout publier"** (envoie tous les IDs visibles).
- chaque ligne montre un état après envoi (succès / URL Site B / erreur), alimenté par `site_b_publications`.

La page **Publication Site B** devient un simple **journal des envois** (table `site_b_publications`), sans bouton "publier" — la publication se déclenche depuis la liste des articles.

## 3. Upload des images du Site A vers le Site B

L'Actor Apify reçoit déjà `featuredImageUrl`, mais le pipeline actuel ne l'envoie pas. À corriger :

- **`src/lib/site-b/apify-batch.functions.ts`** : pour chaque post sélectionné, résoudre `featured_media` → URL publique via `getMedia(authSource, post.featured_media)` et la passer à `publishToSiteB({ ..., featuredImageUrl })`.
- **`apify-actor/src/uploadImage.ts`** : vérifier que `setFeaturedImageFromUrl` télécharge l'image depuis Site A, l'uploade dans la bibliothèque média de Site B (via `/wp-admin/media-new.php`), puis l'associe comme image à la une de l'article. Ajouter des logs et un screenshot d'erreur si échec.
- **Images inline du contenu** : hors périmètre pour cette itération (l'HTML continuera de pointer vers les URLs Site A). À noter dans `.lovable/plan.md` comme évolution future si besoin.

## 4. Ne pas toucher l'auteur côté Site B

- **`apify-actor/src/createPost.ts`** : retirer toute interaction avec le panneau "Auteur" (aucune existe aujourd'hui, mais on documente la règle dans un commentaire en tête de fichier).
- **Payload Apify** (`apify.functions.ts`) : ne jamais inclure de champ `author`.
- **`src/services/migration/pipeline.server.ts`** : devenu inutile (c'était l'ancien chemin REST→REST) → suppression complète + nettoyage de ses imports (`src/services/wordpress/posts.server.ts` `createPost/updatePost` restent pour Site A en lecture uniquement, mais on retire les exports non utilisés).

---

## Détails techniques

- Pas de migration SQL.
- `site_b_publications` reste tel quel.
- `wp_connections` Site B reste utilisé pour les credentials Apify (fallback env conservé).
- Build attendu vert ; aucun nouveau secret.

## Hors périmètre (à confirmer si vous voulez les inclure)

- Réécriture des images inline (`<img src="siteA/...">` → médias Site B).
- Migration des catégories/tags vers Site B.
- Pagination/recherche dans la liste Site A (418 articles → on affichera tout, triable par date).
