
## Diagnostic

L'Actor se connecte et atteint bien `Ajouter un article`, mais le sélecteur du titre timeout. La capture montre que Site B utilise :

- **Éditeur Classique** (TinyMCE) avec onglets Visuel/Code, bouton « Ajouter un média ». Pas de Gutenberg.
- **Champ titre** avec placeholder « Saisissez le titre » — l'id n'est probablement pas `#title` standard (sinon ça matcherait en 60s). Très probablement le thème a un input personnalisé.
- **Champs ACF** spécifiques : `Date` (texte), `Image` (bouton « Ajouter une image ») — PAS la métabox WordPress « Image à la une ».
- **Étiquettes = cases à cocher** (Conformité, Environnement, RSE, SOBRAGA…) dans un panneau latéral, pas un input texte type « newtag ».
- **Publier** : bouton bleu `#publish` (ok).
- **CPT slug réel** : `actualites` (déjà détecté automatiquement, ok).

L'erreur actuelle vient du sélecteur titre + on tente Gutenberg / featured image standard qui n'existent pas ici.

## Plan de correction

### 1. `apify-actor/src/createPost.ts` — refonte pour Site B Classique + ACF

- **Attendre le formulaire** : `form#post`, `input[name='post_title']`, ou input avec `placeholder*='titre'` (timeout 90s) au lieu de `#title, .block-editor…`.
- **Forcer le chemin Classique** : retirer toute la branche Gutenberg (`wp.data`, `.editor-post-title__input`, panneaux « Document », overlays plein écran) — inutile et source de timeouts.
- **Remplir le titre** via `input[name='post_title']` puis fallback `input[placeholder*='titre' i]`.
- **Contenu** : basculer en onglet Code (`button.switch-html`, `#content-html`) et écrire dans `textarea#content`. Si absent, fallback iframe TinyMCE (`#content_ifr` → `body#tinymce`).
- **Slug** : conserver l'édition `#edit-slug-box` mais rendre tolérant (n'échoue pas si la box n'existe pas — certains thèmes la cachent).
- **Auteur** : aucune action (déjà respecté, conserver le commentaire).

### 2. Champs ACF (nouveau bloc dans `createPost.ts`)

- **Date ACF** : repérer le label `Date` dans `.acf-field` ou la métabox « Champs Actualités » → remplir le `input[type='text']` enfant avec la date au format attendu (probablement `JJ/MM/AAAA` ou `AAAAMMJJ` selon ACF). On enverra `article.date` (ISO) reformaté ; si le champ refuse, on log un warning sans bloquer.
- **Image ACF** : cliquer sur le bouton `Ajouter une image` à l'intérieur du champ ACF Image, puis réutiliser la modale média WP (logique déjà dans `uploadImage.ts`) pour téléverser depuis l'URL Site A, et confirmer avec « Sélectionner » au lieu de « Définir l'image à la une ».
- Nouveau fichier interne ou fonction `setAcfFeaturedImageFromUrl(page, imageUrl)` ; on garde `setFeaturedImageFromUrl` pour compatibilité mais on appelle d'abord l'ACF si présent.

### 3. Étiquettes (taxonomie checkbox)

- Si `article.tagSlug` (ou nouveau `article.tagSlugs: string[]`) est fourni : dans la métabox `Étiquettes`, cocher la case dont le label correspond (case-insensitive). Si absente, l'ajouter via l'onglet `+ Ajouter une catégorie` visible en bas du panneau.

### 4. `apify-actor/src/login.ts`

- Aucun changement, le login fonctionne.

### 5. Sélection du CPT

- Déjà ok : `actualites` détecté. Ne plus écraser avec `actualite` dans l'input par défaut (`cptSlug` par défaut → `actualites`).

### 6. Capture diagnostic

- En cas d'échec, déjà : screenshot + HTML sauvegardés dans le KV store. Ajouter une ligne de log listant les `input[name]` présents sur la page pour accélérer le diagnostic futur.

### 7. Déploiement

- Le user pousse via GitHub → Apify rebuild → relance « Publier sur B » depuis l'app.

## Notes techniques (pour info)

- Aucun changement côté Lovable/TanStack ; tout le correctif est dans `apify-actor/`.
- Fichiers modifiés : `apify-actor/src/createPost.ts`, `apify-actor/src/uploadImage.ts`, `apify-actor/.actor/input_schema.json` (default `cptSlug` → `actualites`).
- Pas de migration DB, pas de nouveau secret.
