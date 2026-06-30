## Plan de correction

### Le vrai blocage actuel

L’Actor se connecte, mais l’URL `post-new.php?post_type=actualites` ne montre pas le formulaire attendu (timeout sur le champ titre, et `Champs détectés sur la page:` vide → la page n’a même pas de `form#post`). Il faut donc reproduire votre parcours manuel et diagnostiquer ce qui s’affiche réellement.

### 1. Reproduire votre parcours dans le back-office

Après login, l’Actor :

```text
Menu Actualités → clic "Ajouter un article" → attend le formulaire
```

Si l’URL directe ne donne pas le formulaire (page vide, redirection, blocage Sucuri, écran inattendu), il bascule sur la navigation par le menu comme vous le faites.

### 2. Logs de diagnostic AVANT le timeout

Avant d’attendre 90 s sur le titre, l’Actor journalisera :

- URL réelle atteinte + titre de la page
- présence/absence de `form#post`
- liste des inputs visibles
- détection d’un écran Sucuri / erreur WP / page vide

Si ça échoue encore, on saura immédiatement où il est arrivé.

### 3. Remplissage du formulaire (selon votre capture)

- Titre : `input[name='post_title']` (placeholder « Saisissez le titre »)
- Contenu : éditeur Classique TinyMCE
- Date ACF : champ texte du `.acf-field` « Date »
- Étiquettes : cases à cocher
- Bouton `#publish`
- Auteur : non touché

### 4. Upload d’image ACF (réponse à votre question)

Pas besoin d’ouvrir l’explorateur de fichiers système. Playwright écrit directement dans le `<input type="file">` masqué de la popup WordPress :

```text
1. Télécharger l'image depuis Site A en mémoire (fetch → buffer)
2. Clic "Ajouter une image" (champ ACF) → popup média WP
3. Clic onglet "Téléverser des fichiers"
4. setInputFiles({name, mimeType, buffer}) sur l'input file caché
   (n'ouvre PAS le gestionnaire de fichiers de l'OS)
5. Attente vignette "sélectionnée"
6. Clic bouton bleu "Sélectionner" pour valider dans le champ ACF
```

C’est déjà ce que fait `uploadImage.ts` — donc pas de changement côté upload.

### 5. Alignement CPT par défaut

Mettre `actualites` (et non `actualite`) en valeur par défaut pour éviter la confusion dans les logs.

### 6. Validation attendue dans Apify

```text
[actor] Connexion OK
[actor] Ouverture Actualités via le menu
[actor] Formulaire actualité détecté (URL=..., title=...)
[actor] Titre rempli / Contenu rempli / Date remplie
[actor] Image ACF téléversée
[actor] Publication confirmée
```

Si l’écran réel diffère, les logs diront exactement quelle page a été atteinte au lieu d’un timeout muet.

### Fichiers touchés

- `apify-actor/src/createPost.ts` (navigation par menu + logs diagnostic + remplissage)
- `apify-actor/.actor/input_schema.json` (défaut `cptSlug` → `actualites`)
- Pas de changement à `uploadImage.ts` ni à `login.ts`
- Aucun changement côté app Lovable / DB / secrets