
# WordPress Content Sync Manager

Application complète de comparaison et migration de contenu entre deux sites WordPress via l'API REST. Tout passe par des Server Functions TanStack Start ; aucun mot de passe n'atteint le navigateur après validation.

## 1. Stack & fondations

- TanStack Start (déjà en place) + React 19 + TypeScript strict (zéro `any`)
- TanStack Router (file-based) + TanStack Query (loader → `ensureQueryData` + `useSuspenseQuery`)
- Server Functions (`createServerFn`) pour tout appel WordPress
- Zod pour toute validation (entrées formulaires + réponses WP)
- TailwindCSS v4 + shadcn/ui + Lucide
- React Hook Form pour les formulaires
- **Lovable Cloud activé** : auth utilisateur + stockage chiffré des credentials WordPress (jamais en clair)

## 2. Direction visuelle

Thème **clair, sobre, dense façon outil pro** :
- Fond `#FAFAFA`, surfaces blanches, bordures `#E5E7EB`
- Accent unique bleu `#2563EB` (actions, focus, badges actifs)
- Sémantique : vert `#16A34A` (identique/OK), ambre `#D97706` (différent), rouge `#DC2626` (absent/erreur), gris (neutre)
- Typo : Inter (UI) + JetBrains Mono (URL, slug, console, hash)
- Coins `rounded-md`, ombres très douces, transitions 150 ms, pas d'effets décoratifs
- Layout : sidebar gauche fixe (Dashboard, Connexions, Comparaison, Migration, Journal) + topbar avec statut des deux sites (pastilles colorées)

## 3. Architecture des dossiers

```text
src/
  routes/
    __root.tsx
    index.tsx                  → redirige vers /dashboard ou /auth
    auth.tsx                   → login Lovable Cloud
    _authenticated/
      route.tsx                → géré par l'intégration
      dashboard.tsx
      connections.tsx          → configuration Site A / Site B + rapport capacités
      comparison.tsx           → DataTable + drawer aperçu côte à côte
      migration.tsx            → sélection, options, lancement, progression
      journal.tsx              → console + rapport final
    api/
      public/                  (rien pour l'instant)
  lib/wordpress/
    wp.functions.ts            → server fns : testConnection, listPosts, listPages, listCategories, listTags, listMedia, listUsers, getPost, createPost, createCategory, createTag, uploadMedia
    comparison.functions.ts    → buildComparison, getDiff
    migration.functions.ts     → migratePosts (streaming via SSE)
  services/wordpress/          → couche serveur pure (pas de TanStack)
    client.ts                  → fetch helper (auth Basic, retries, timeout, pagination, concurrence)
    post.service.ts
    category.service.ts
    tag.service.ts
    media.service.ts
    user.service.ts
    capabilities.service.ts    → rapport API/version/droits/upload
  services/comparison/
    matcher.ts                 → slug → titre → permalink → hash contenu
    hash.ts                    → SHA-256 du contenu HTML normalisé
  services/migration/
    pipeline.ts                → orchestrateur par article
    image-rewriter.ts          → réécriture URLs dans le HTML
    duplicate-resolver.ts      → ignorer / écraser / copier / demander
  schemas/                     → Zod : credentials, WP entities, options migration
  types/                       → types dérivés
  hooks/                       → useConnectionStatus, useComparison, useMigration (SSE), useSelection
  components/
    layout/AppShell.tsx, Sidebar.tsx, Topbar.tsx
    cards/StatCard.tsx, CapabilityCard.tsx
    tables/ComparisonTable.tsx (TanStack Table)
    dialogs/ArticlePreviewDialog.tsx, DuplicateDialog.tsx, MigrationProgressDialog.tsx
    console/LogConsole.tsx
    ui/                        → shadcn
  constants/                   → statuts WP, codes erreur, limites concurrence
  utils/                       → html-normalize, time-format, retry, p-limit
```

## 4. Authentification & stockage credentials

**Sécurité — règle absolue** : le mot de passe d'application n'est jamais renvoyé au navigateur après sauvegarde.

- Auth Lovable Cloud (email/password + Google) protège l'app
- Table `wp_connections` (RLS scopée `auth.uid()`) :
  - `id`, `user_id`, `role` (`source` | `destination`), `site_url`, `username`, `app_password_encrypted`, `created_at`
  - Application Password chiffré côté serveur via `crypto.subtle` AES-GCM + clé `WP_CREDENTIALS_KEY` (générée par `generate_secret`)
- Server fn `saveConnection` : reçoit credentials → teste → chiffre → upsert
- Server fn `getDecryptedCredentials` : **uniquement appelée par d'autres server fns**, jamais exposée au client
- Le client reçoit uniquement : `site_url`, `username`, statut, capacités, date dernier test

## 5. Test de connexion & rapport de capacités

Server fn `testConnection(role)` exécute en parallèle :
1. `GET /wp-json/` → API joignable + version
2. `GET /wp-json/wp/v2/users/me?context=edit` → identité + `capabilities`
3. `HEAD /wp-json/wp/v2/posts?per_page=1` → header `X-WP-Total`
4. `HEAD /wp-json/wp/v2/categories?per_page=1` → total
5. Test droits : `edit_posts`, `publish_posts`, `manage_categories`, `upload_files` lus depuis `capabilities`

Rendu dans deux `CapabilityCard` côte à côte avec ✓ / ✗ et badges.

## 6. Récupération données

- `client.ts` : fetch helper avec
  - Auth Basic (`Authorization: Basic base64(user:appPassword)`)
  - Timeout 30 s, 3 retries exponentiels sur erreurs réseau/5xx
  - `p-limit` à 5 requêtes concurrentes par site
  - Pagination auto via `X-WP-TotalPages` (jamais coupée à 100)
- Chaque entité WP normalisée vers un DTO sérialisable (Zod schema) avec tous les champs demandés (id, slug, titre, contenu, extrait, dates, statut, auteur, catégories, tags, featured_media, comment/ping status, permalink, meta, _embedded si dispo)

## 7. Moteur de comparaison

`buildComparison({ entity: 'post' })` server fn :
1. Charge tous les posts des deux sites (cache TanStack Query, `staleTime` 5 min)
2. Pour chaque post côté A : matcher → cherche dans B par **slug → titre normalisé → permalink → hash contenu**
3. Retourne un tableau de `ComparisonRow` :
   - `state`: `identical | different | only_on_source | only_on_destination | updated`
   - `sourcePost`, `destinationPost` (optionnels), `diffFields` (titre/contenu/extrait/cats/tags)

## 8. Interface comparaison

`ComparisonTable` (TanStack Table) :
- Colonnes : checkbox, titre + slug, date, auteur, catégories (badges), tags (badges), statut, présence A (pastille), présence B (pastille), état (badge coloré), actions (œil / migrer)
- Recherche full-text, tri toutes colonnes, pagination 25/50/100, colonnes masquables, filtres (état, statut, catégorie, auteur, plage dates, mot-clé)
- Sélection multiple persistante entre pages, compteur en footer
- Skeletons pendant chargement

**Aperçu côte à côte** : Dialog plein écran, deux colonnes Site A / Site B, onglets (Contenu rendu HTML sandboxed, Brut, Métadonnées, Catégories/Tags). Les différences sont surlignées (jaune doux).

## 9. Migration

**Options** (form Zod) :
- Périmètre : tous, sélection, absents, modifiés, par statut, catégorie, auteur, plage dates, mot-clé
- Stratégie doublons : ignorer / écraser / créer copie (suffixe slug) / demander
- Conserver : slug, date, statut, extrait, featured image (checkboxes, cochés par défaut)
- Concurrence : 2 articles en parallèle max

**Pipeline par article** (`pipeline.ts`) :
1. Résoudre doublon
2. Pour chaque catégorie/tag : chercher (slug) → utiliser ou créer
3. Télécharger featured image + toutes images du contenu HTML → upload sur B → map URL → URL
4. Réécrire le HTML (`image-rewriter.ts`) avec les nouvelles URLs/IDs
5. `POST /posts` avec champs conservés + `featured_media` + `categories[]` + `tags[]`
6. Émettre événements de progression

**Streaming progression** : server **route** `/api/public/migration/stream` (POST authentifié via cookie session Lovable Cloud) renvoie un `ReadableStream` SSE. Le hook `useMigration` consomme les events :
- `step` (connexion/comparaison/download/upload/create), `progress` (n/total), `log` (info/warn/error), `done` (rapport)

**Dialog de progression** :
- Barre globale + barre étape courante
- Temps écoulé, ETA (moyenne mobile), compteurs réussi / échoué / restants
- Bouton « Voir le journal »

**Gestion erreurs** : jamais d'arrêt. Chaque erreur capturée → log + entrée rapport `{ postId, slug, step, httpStatus, message }`. Rapport final téléchargeable JSON/CSV.

## 10. Journal

- Console intégrée (`LogConsole`) : timestamps `[HH:MM:SS]`, niveau, message, code HTTP, copiable, filtrable, ring-buffer 5000 lignes côté client
- Persistance optionnelle des migrations dans `migration_runs` (id, started_at, ended_at, summary, log_jsonl)

## 11. Dashboard

Cards : Articles Site A, Articles Site B, Différences détectées, Sélection en cours, Dernière migration (réussis/échoués/durée), Capacités (mini état des deux sites). Tout en `useSuspenseQuery` avec skeletons.

## 12. UX transverse

- Toasts (`sonner`) pour succès/erreurs ponctuels
- Command palette (`cmdk`) : K pour naviguer + lancer actions (Tester connexion, Lancer comparaison, Ouvrir journal)
- Responsive (sidebar collapsible < md)
- États vides explicites avec CTA
- Pas de dark mode (choix utilisateur : light only)

## 13. Sécurité — checklist

- Tous appels WP via Server Functions ; aucun secret côté browser
- Validation Zod systématique des entrées et des réponses WP (les WP custom peuvent renvoyer n'importe quoi)
- Sanitization du HTML rendu en aperçu (DOMPurify) ; iframe `sandbox` pour le rendu complet
- Timeout + retries + concurrence limitée pour ne pas DDoS le WP cible
- RLS sur `wp_connections` et `migration_runs`
- App Password chiffré AES-GCM, clé jamais exposée
- Logs serveur sans credentials

## 14. Détails techniques clés

- **Lovable Cloud activé** ; tables : `wp_connections`, `migration_runs` (+ GRANT + RLS)
- **Secrets générés** : `WP_CREDENTIALS_KEY` (64 chars) via `generate_secret`
- **Pas de Edge Functions** : tout en `createServerFn` ; un seul server route SSE pour la migration
- **Types** : `Database` Supabase généré + types WP dérivés des schémas Zod
- **Tests rapides** : `bun add` pour `dompurify`, `cmdk` (déjà via shadcn ?), `@tanstack/react-table`, `@fontsource/inter`, `@fontsource/jetbrains-mono`
- **Aucune logique métier dans les composants** : hooks + services + server fns uniquement

## 15. Ordre de livraison (un seul gros patch)

1. Cloud + auth + tables + secret
2. Layout (shell, sidebar, topbar, dashboard vide)
3. Page Connexions + chiffrement + test capacités
4. Services WP + pagination + cache
5. Comparaison (moteur + table + aperçu)
6. Migration (pipeline + SSE + progression + journal + rapport)
7. Filtres avancés + détection doublons + command palette
8. Polish (skeletons, vides, toasts, responsive)
