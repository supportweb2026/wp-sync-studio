Je vais corriger le flux de publication pour récupérer et traiter la vraie erreur Apify, puis rendre l’Actor plus robuste côté WordPress.

Plan :

1. Remplacer l’appel Apify synchrone trop opaque
   - Ne plus dépendre uniquement de `run-sync-get-dataset-items`, qui renvoie parfois seulement `run-failed`.
   - Lancer le run Apify, attendre sa fin, puis lire explicitement :
     - le statut du run,
     - les items du dataset,
     - l’ID du run,
     - l’erreur détaillée quand le run échoue.
   - Enregistrer cette erreur détaillée dans le journal Site B.

2. Corriger les causes probables dans l’Actor WordPress
   - Rendre le clic Publier/Mettre à jour plus tolérant pour Gutenberg et l’éditeur classique.
   - Ajouter une attente claire après sauvegarde/publication.
   - Si l’image à la une échoue, continuer la publication mais journaliser l’avertissement au lieu de faire échouer tout l’article.
   - Améliorer les messages d’erreur : étape de login, recherche de doublon, création, upload image, publication.

3. Améliorer le journal Site B pour l’action en cours
   - Dès qu’un article est envoyé, créer une ligne `running` avec le run Apify dès qu’il est connu.
   - Continuer le rafraîchissement automatique jusqu’au statut final.
   - Afficher le lien direct vers le run Apify et l’erreur réellement exploitable.

4. Vérification
   - Vérifier le typage TypeScript.
   - Vérifier que le bouton de publication crée bien une ligne de journal et que les échecs contiennent une cause lisible.

Important : après correction du code de l’Actor, il faudra redéployer l’Actor avec `apify push`, sinon Apify continuera d’exécuter l’ancienne version.