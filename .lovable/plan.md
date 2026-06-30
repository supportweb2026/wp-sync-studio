## Diagnostic

La bannière "Connexion Site B non configurée" vient de `getApifyActorStatus` (dans `src/lib/site-b/apify.functions.ts`). Cette fonction ne regarde **que** la table `wp_connections`. Or vous n'avez pas (encore) sauvegardé Site B via le formulaire Connexions — vous utilisez les secrets `SITE_B_URL` / `SITE_B_USERNAME` / `SITE_B_PASSWORD`.

Du coup, incohérence :
- `publishToSiteB` (l'action réelle) **accepte** les secrets ENV en fallback → la publication marcherait.
- `getApifyActorStatus` (la bannière) **ignore** les secrets ENV → affiche "non configurée" à tort.

Le secret `APIFY_ACTOR_ID` que vous venez d'ajouter est bien détecté ; ce n'est plus lui le problème.

## Correctif

Modifier `getApifyActorStatus` dans `src/lib/site-b/apify.functions.ts` pour appliquer **exactement** la même règle que `publishToSiteB` :

1. Tenter `loadDestAuthFromDb` (Connexion utilisateur).
2. Sinon, retomber sur `SITE_B_URL` / `SITE_B_USERNAME` / `SITE_B_PASSWORD`.
3. Si au moins un trio complet (DB ou ENV) existe → `ready: true`, avec un sous-statut indiquant la source utilisée (`"db"` ou `"env"`).
4. Sinon seulement → "Connexion Site B non configurée".

Mettre à jour `src/routes/_authenticated/migration.tsx` pour afficher un petit indice neutre quand la source est `env` : « Site B utilise les secrets globaux ; sauvegardez-le dans Connexions pour le mode multi-utilisateur. » (info, pas bloquant).

## Hors périmètre

- Pas de migration DB.
- Pas de changement du formulaire Connexions ni de l'Actor Apify.
- Pas de changement de la logique de publication.

Une fois appliqué, la bannière disparaît et le bouton "Publier via Apify" devient actif.
