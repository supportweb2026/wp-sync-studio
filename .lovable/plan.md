## Objectif

Fiabiliser l’Actor en une seule itération pour stopper les échecs payants sur Apify. On corrige le contenu (cause actuelle du crash) ET on durcit en même temps tous les autres champs du formulaire Site B (titre, slug, date ACF, image ACF, étiquettes, publication) pour éviter un aller-retour par champ.

## 1. Contenu (cause de l’échec actuel)

Fichier : `apify-actor/src/createPost.ts` — fonction `fillContent`.

- Forcer l’onglet « Texte » s’il existe (`#content-html`, `button.switch-html`).
- Si TinyMCE est actif (`window.tinymce`), utiliser :
  - `tinymce.get('content').setContent(html)`
  - puis `tinymce.get('content').save()` pour synchroniser le textarea.
- Sinon, écrire dans le textarea via JS même s’il est masqué :
  - `el.value = html`
  - dispatch `input` + `change`.
- Ne plus appeler `locator.fill()` sur un textarea masqué (origine du timeout actuel).
- Logguer la méthode utilisée : `tinymce`, `textarea-visible`, `textarea-hidden-js`, `iframe-body`.

## 2. Titre

- Garder les sélecteurs actuels mais passer par `evaluate` + events si `fill()` échoue (même logique que le contenu) pour gérer un champ stylisé/masqué.
- Logguer le sélecteur retenu.

## 3. Slug

- Aujourd’hui : on écrit dans `input[name='post_name']` puis on tente le bouton “Modifier le permalien”.
- Durcir :
  - Si `#edit-slug-buttons button.edit-slug` n’apparaît pas (cas fréquent avant 1er enregistrement), juste écrire la valeur dans le hidden input.
  - Ne plus échouer si `#new-post-slug` n’existe pas.

## 4. Date (ACF)

- Garder le format `JJ/MM/AAAA` dans le champ visible.
- Forcer la valeur hidden ACF (`input.input-alt`, format `AAAAMMJJ`) via JS + events `change`.
- Fallback supplémentaire : si on ne trouve pas la métabox ACF par titre “Date”, chercher `.acf-field[data-name*='date']`.
- Logguer : champ trouvé / valeur écrite / hidden mise à jour.

## 5. Image à la une (ACF)

Fichier : `apify-actor/src/uploadImage.ts`.

- S’assurer que le flux est :
  1. Clic sur le bouton ACF “Ajouter une image”.
  2. Attente de la modale média WordPress (`.media-modal`).
  3. Onglet “Téléverser des fichiers” si présent.
  4. `setInputFiles` sur `input[type=file]` (même masqué).
  5. Attente de la fin d’upload (vignette sélectionnée).
  6. Clic sur le bouton bleu “Sélectionner” / “Choisir l’image” / “Définir l’image”.
- Télécharger l’image depuis l’URL publique Site A en mémoire (Buffer) et la passer à `setInputFiles` via un fichier temporaire dans `/tmp`.
- Si l’image échoue : ne PAS bloquer la publication, juste logguer `imageWarning` (déjà en place).

## 6. Étiquettes

- Cocher les cases existantes dans `Étiquettes` par texte exact (déjà en place).
- Ajouter un fallback : si la case n’existe pas, ne rien créer (Site B ne doit pas inventer de nouvelles étiquettes).
- Logguer les tags appliqués vs ignorés.

## 7. Publication

- Cliquer sur `#publish`.
- Attendre l’un de : message de succès, lien “Voir l’article”, ou bouton qui devient “Mettre à jour”.
- Si redirection sur `post.php?post=ID&action=edit`, extraire `postId` depuis l’URL (déjà en place) et l’URL publique via `#sample-permalink a`.

## 8. Diagnostic et logs

- Avant chaque étape, log court : `[actor] étape: <nom>`.
- En cas d’échec : dump déjà en place (`dumpPageDiagnostics`), on garde.
- Ajouter `imageWarning` et `tagsIgnored` dans l’objet de sortie Apify pour qu’on voie ça côté UI sans rouvrir les logs.

## 9. Ce qu’on NE touche pas

- Login `/adsobra` (OK dans les logs).
- Détection base admin `/wp` (OK dans les logs).
- Auteur du post (interdit, on n’y touche jamais).
- Schémas Zod côté app.
- UI React.

## 10. Déploiement

Une seule chose à faire côté utilisateur après le patch :

```
cd apify-actor && git push   (ou apify push si Source = local)
```

Puis relancer une publication. Si ça casse encore, le log dira précisément quelle étape — plus de timeout aveugle de 30 s à 90 s.

## Résultat attendu

- Plus de `locator.fill: Timeout` sur `textarea#content`.
- Une publication réussie écrit : titre, contenu HTML, slug, date ACF, image ACF, étiquettes cochées, puis publie.
- En cas d’échec partiel (ex. image), l’article est quand même publié et l’UI montre un avertissement clair.