## Diagnostic des incohérences

**1. Connexions** — Le formulaire Site B (destination) demande encore un **mot de passe d'application REST**, alors que Site B est protégé par Sucuri et automatisé via Apify (login admin classique). Site A reste en REST. Les deux formulaires sont identiques aujourd'hui : c'est faux.

**2. Comparaison** — `fetchComparison` appelle `listAllPosts(dst)` via REST sur Site B. Comme Site B n'expose pas REST de façon fiable (Sucuri), la colonne "Absent de B" et l'état "Identique/Différent" reposent sur une lecture qui peut échouer ou être bloquée. Il faut clarifier ce qu'on compare et avec quelle source de vérité côté B.

**3. Migration** — Seule la migration **sélective** existe (via `sessionStorage`). Pas de mode "tout publier d'un coup". Et l'ancien `runMigrationFn` (REST→REST) est encore présent mais inutilisé puisque Site B passe par Apify.

---

## Cibles fonctionnelles

### A. Connexions — deux formulaires distincts
- **Site A (source, REST)** : URL + utilisateur + mot de passe d'application. Inchangé. Stocké dans `wp_connections` (role=`source`).
- **Site B (destination, Apify)** : URL d'admin + utilisateur + mot de passe admin (le vrai, pas un app password). Stocké dans `wp_connections` (role=`destination`) mais le label / l'aide / la validation changent :
  - Plus de "mot de passe d'application", c'est "mot de passe administrateur WordPress".
  - Plus de rapport de capacités REST (pas d'appel `/wp-json`). À la place, un bouton "Tester le login" qui déclenche un mini-run Apify (login + lecture du tableau de bord) et stocke `last_tested_at` + un résumé minimal dans `last_capabilities` (par ex. `{ loginOk: true, dashboardReachable: true }`).
  - Au moment de publier, ce sont ces identifiants qui sont injectés dans l'input Apify (à la place des secrets globaux `SITE_B_USERNAME`/`SITE_B_PASSWORD`), ce qui rend l'app multi-utilisateur.

### B. Comparaison — source de vérité claire
- Site A : lecture REST (comme aujourd'hui).
- Site B : **lecture via Apify** (un Actor "reader" qui parcourt la liste des articles du back-office et renvoie `{slug, title, date, status}`). Pas de contenu HTML détaillé en v1, donc le matcher se restreint aux champs disponibles côté B :
  - États conservés : `only_on_source`, `only_on_destination`, `identical` (slug + titre normalisé + date).
  - État `different` : limité à `titre` / `statut` / `date` (pas `contenu` ni `extrait`, faute de données fiables côté B).
- Cache : le résultat de la lecture Site B est mis en cache (table `site_b_index` ou dans `site_b_publications` + un timestamp), refresh manuel via bouton "Recharger Site B".
- Le message "notConfigured" reste, mais ajoute "Site B non testé" si jamais le login Apify n'a pas encore été validé.

### C. Migration — sélective ET globale
- Page "Publication Site B" propose deux modes :
  - **Sélective** : articles cochés depuis la Comparaison (flux actuel via `sessionStorage`).
  - **Globale** : tous les articles `only_on_source` (+ éventuellement `different` si `duplicateStrategy=overwrite`). Bouton "Publier tous les articles manquants" avec compteur.
- Suppression de l'ancien `runMigrationFn` REST→REST (mort) et des bouts d'UI qui le supposeraient. Une seule pipeline : Apify.
- Garde-fou : batch maximum à 50 (limite Apify actuelle) — au-delà, on découpe automatiquement en plusieurs runs séquentiels et on agrège les résultats.

---

## Détails techniques

```text
src/
  routes/_authenticated/
    connections.tsx        # 2 formulaires distincts: REST (A) vs Apify (B)
    comparison.tsx         # Bouton "Recharger Site B" + bandeau état Site B
    migration.tsx          # Onglets "Sélective" / "Globale"
  lib/
    wordpress/wp.functions.ts
      - listConnections / saveConnection / deleteConnection   (gardés)
      - testConnectionRole                                    (split en 2)
        * testSourceRest (role=source) → probeCapabilities REST
        * testDestinationApify (role=destination) → run Actor "login-check"
      - fetchComparison                                       (modifié: B via Apify reader)
      - runMigrationFn                                        (SUPPRIMÉ)
      - listMigrationRuns / getMigrationRun                   (gardés, alimentés par les runs Apify)
    site-b/
      apify.functions.ts            # publishToSiteB (existant) + loginCheckSiteB (nouveau) + listSiteBPosts (nouveau)
      apify-batch.functions.ts      # accepte un mode "all-missing" et chunke par 50
  services/
    comparison/matcher.ts           # tolère un destination "partiel" (sans content/excerpt)
  schemas/wordpress.ts              # nouveau schéma "DestinationCreds" (admin password) vs "SourceCreds" (app password)
```

Côté Apify Actor (`apify-actor/`) :
- Ajout de deux entrées : `mode: "login-check"` (login + screenshot du dashboard, sort `{loginOk}`) et `mode: "list-posts"` (parcourt la liste des posts, renvoie `{slug,title,date,status}[]`).
- Le mode `publish` existant reste inchangé fonctionnellement, mais accepte désormais `username`/`password` dans l'input (au lieu de lire les secrets globaux), pour la cohérence multi-utilisateur. Les secrets `SITE_B_USERNAME`/`SITE_B_PASSWORD` deviennent un fallback.

Migrations BDD :
- Ajout colonne `wp_connections.kind` (`rest` | `apify`) avec contrainte cohérente avec `role` (`source`→`rest`, `destination`→`apify`).
- Pas de nouvelle table : le cache d'index Site B vit dans `last_capabilities` JSON (clé `index`) avec `last_tested_at` comme date de fraîcheur.

---

## Ce qui reste hors-scope

- Pas de diff de contenu HTML côté B (Apify ne lit pas le contenu rendu en v1).
- Pas de re-déploiement automatique de l'Actor : l'utilisateur reste responsable de `apify push` après les ajouts de modes.
- Pas de planification/cron : tout est déclenché à la main.

---

## Question avant build

Avant de coder, deux points à confirmer :

1. **Lecture Site B via Apify** : OK pour ajouter un mode "list-posts" à l'Actor (≈ 30s par run, pagination du back-office) ? Sinon alternative = pas de comparaison côté B et on liste seulement ce qui a déjà été publié via cette app (table `site_b_publications`).
2. **Multi-utilisateur** : on bascule bien le couple username/password Site B des secrets globaux Apify vers la table `wp_connections` par utilisateur ? (Recommandé, sinon tous les users publient avec le même compte admin.)
