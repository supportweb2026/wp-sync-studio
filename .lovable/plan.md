## Problème

Le timeout vient du fait que l'Actor va sur `https://sobraga.com/adsobra/wp-admin` (siteUrl + loginPath par défaut `/wp-admin`). Ce n'est pas l'URL de login réelle : le vrai écran de connexion est directement `https://sobraga.com/adsobra`. Résultat : Sucuri/WP ne montre jamais `#user_login`, Playwright attend dans le vide → timeout 30 s.

## Correctifs

1. **Connexions Site B (`/connections`)** : faire de "Chemin de connexion" un champ optionnel (placeholder `/wp-login.php` ou vide) avec une aide expliquant « URL exacte où apparaît le formulaire WordPress. Laissez vide si c'est déjà `siteUrl`. »
2. **`saveConnection` + schéma** : accepter `loginPath` vide, ne pas re-forcer `/wp-admin`.
3. **Actor `login.ts`** :
   - Construire l'URL cible :
     - si `loginPath` vide ou `/` → aller sur `siteUrl` tel quel
     - sinon concaténer proprement
   - Augmenter le timeout de `waitForSelector` à 60 s et attendre `#user_login, #user_pass, #wpadminbar, form#loginform`
   - Si on tombe sur une page Sucuri (`#sucuri-cloudproxy-firewall`, `Access Denied`, `Sucuri WebSite Firewall`), lever une erreur explicite « Sucuri bloque l'accès — vérifiez l'IP autorisée / l'URL de login »
   - Garder le screenshot d'erreur (déjà fait) pour diagnostic dans la KV store Apify
4. **UI `/migration`** : afficher un lien direct vers le screenshot `error-screenshot.png` du run (clé KV) en cas d'échec, pour que vous voyiez ce que voit le navigateur.
5. **Valeur par défaut côté Actor** : si `loginPath` absent, ne plus mettre `/wp-admin` — utiliser `""` (= siteUrl direct).

## Côté vous, après build

1. Aller dans `/connections` → Site B → mettre **Chemin de connexion = vide** (ou `/wp-login.php` si jamais le formulaire n'est pas sur la home `/adsobra`).
2. Relancer un test ; si ça échoue encore, ouvrir le run Apify → onglet *Storage / Key-value store* → `error-screenshot.png` pour voir la page réelle (Sucuri challenge, 404, etc.).

## Détails techniques

Fichiers touchés :
- `apify-actor/src/login.ts` — nouvelle construction d'URL + timeout 60 s + détection Sucuri
- `apify-actor/src/actor.ts` — défaut `loginPath = ""` au lieu de `/wp-admin`
- `apify-actor/.actor/input_schema.json` — `default` de `loginPath` retiré (ou `""`)
- `src/schemas/wordpress.ts` — `loginPath` optionnel sans default `/wp-admin`
- `src/routes/_authenticated/connections.tsx` — placeholder + helper text
- `src/routes/_authenticated/migration.tsx` — lien vers le screenshot d'erreur du run
- `src/lib/site-b/apify.functions.ts` — exposer `errorScreenshotUrl` (KV record URL) dans le résultat
