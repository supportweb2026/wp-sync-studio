Je comprends : le run n’arrive même plus à l’étape “Actualités → Ajouter un article”. Il échoue avant, au login, parce que l’Actor attend des sélecteurs WordPress standards (`#user_login`, `#user_pass`) sur `https://sobraga.com/adsobra`, alors que ce lien correspond à votre procédure d’accès spécifique.

Plan ciblé :

1. Corriger l’input envoyé à Apify
   - Remplacer le `cptSlug` envoyé par l’app de `actualite` vers `actualites`, car le log montre encore `cpt=actualite` malgré le schéma Actor.
   - Conserver `siteUrl=https://sobraga.com/adsobra` et `loginPath=""`.

2. Rendre le login compatible avec votre lien réel
   - Ne plus supposer que la page contient forcément `#user_login` / `#user_pass`.
   - Ajouter une détection de formulaire de login plus large : champs visibles de type texte/email/password, boutons “Connexion / Se connecter / Log in”.
   - Si les champs WordPress standards n’existent pas, remplir le premier champ utilisateur visible + le premier champ mot de passe visible, puis cliquer le bouton de connexion.
   - Après soumission, valider la réussite par présence du menu admin WordPress (`#adminmenu`, `#wpadminbar`, `wp-admin`) au lieu de dépendre uniquement de `#wpadminbar`.

3. Ne pas inventer un autre chemin de création
   - Après connexion réussie, suivre exactement le parcours que vous avez donné :

```text
Actualités → Ajouter un article → Titre → Contenu → Date → Ajouter une image → Étiquettes → Publier
```

   - La navigation directe `post-new.php?...` ne sera qu’un fallback, pas le chemin principal.

4. Ajouter des logs utiles au login
   - En cas d’échec, enregistrer dans les logs : URL réelle, titre de page, formulaires détectés, champs visibles détectés, boutons/liens visibles.
   - Comme ça, si le lien affiche une page intermédiaire, un blocage Sucuri ou un autre formulaire, on verra exactement quoi adapter.

5. Garder l’upload image tel quel
   - Pour la popup “Ajouter une image → Téléverser des fichiers → Sélectionnez des fichiers”, Playwright continuera à injecter le fichier directement dans l’input file caché avec `setInputFiles`; il n’ouvre pas de gestionnaire de fichiers.

Fichiers à modifier :
- `src/lib/site-b/apify.functions.ts` pour envoyer `actualites`.
- `apify-actor/src/login.ts` pour gérer votre formulaire réel au lieu du login WordPress standard uniquement.
- `apify-actor/src/createPost.ts` pour privilégier le parcours menu “Actualités → Ajouter un article”.

Après approbation, je fais uniquement ces corrections ciblées.