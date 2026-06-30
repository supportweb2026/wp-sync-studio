Je vais corriger le flux Apify pour que `https://sobraga.com/adsobra` serve uniquement à se connecter, puis que toutes les actions d’administration utilisent automatiquement la vraie base admin `https://sobraga.com/wp/wp-admin`.

Plan d’implémentation :

1. Ajouter une résolution d’URL admin après connexion
   - Après login, détecter l’URL réelle du back-office WordPress.
   - Si l’URL contient `/wp/wp-admin`, utiliser `https://sobraga.com/wp` comme base admin.
   - Ne plus construire les URLs admin depuis l’URL de connexion `/adsobra`.

2. Corriger la création d’actualité
   - Remplacer le fallback actuel :
     `https://sobraga.com/adsobra/wp-admin/post-new.php?post_type=actualites`
   - Par :
     `https://sobraga.com/wp/wp-admin/post-new.php?post_type=actualites`
   - Garder la navigation menu “Actualités → Ajouter un article” si elle existe, mais basée sur la vraie URL admin.

3. Corriger la recherche de doublon
   - Vérifier que `findBySlug` n’utilise pas non plus `/adsobra/wp-admin`.
   - Si nécessaire, lui passer la base admin résolue après connexion.

4. Garder `adsobra` uniquement pour le login
   - `siteUrl` / `loginPath` resteront utilisés pour atteindre le formulaire de connexion.
   - Les opérations post-login utiliseront une nouvelle base admin déduite de la session connectée.

5. Ajouter des logs clairs
   - Loguer :
     - URL de connexion utilisée.
     - URL admin détectée après connexion.
     - URL exacte utilisée pour “Ajouter un article”.
   - Comme ça, si ça casse encore, on verra immédiatement si l’Actor utilise la bonne adresse.