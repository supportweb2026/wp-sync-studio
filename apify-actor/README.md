# wp-site-b-publisher (Apify Actor)

Actor Apify qui automatise le back-office WordPress du Site B (bloqué par Sucuri en REST) pour publier une Actualité via Playwright cloud.

## Qu'est-ce que c'est ?

Ce dossier `apify-actor/` est un micro-projet indépendant. Une fois déployé sur Apify, il devient un **Actor** : Lovable appelle cet Actor via l'API Apify pour publier des articles sur Site B sans avoir besoin de Playwright en local.

## Prérequis

- Un compte Apify (https://console.apify.com/sign-up)
- Votre token Apify (disponible dans Paramètres → Intégrations → API token)
- Node.js 18+ et npm installés sur votre machine

## Déploiement (3 commandes)

Ouvrez un terminal dans le dossier `apify-actor/` (où se trouve ce README) :

```bash
npm install -g apify-cli
apify login          # collez votre token Apify quand il est demandé
apify push           # build + déploiement sur Apify
```

Après `apify push`, Apify affiche un identifiant de cette forme :

```
votre-username~wp-site-b-publisher
```

C'est cette valeur qu'il faut ajouter dans Lovable comme secret **`APIFY_ACTOR_ID`**.

## Structure du dossier

- `src/main.ts` — orchestre le run (login → vérification doublon → création d'article).
- `src/login.ts` — connexion au back-office WordPress.
- `src/findBySlug.ts` — recherche un article existant par slug.
- `src/createPost.ts` — remplit l'éditeur Gutenberg ou Classique et publie.
- `src/uploadImage.ts` — upload l'image mise en avant.
- `src/types.ts` — types TypeScript.
- `.actor/actor.json` — nom et version de l'Actor.
- `.actor/input_schema.json` — formulaire d'entrée dans la console Apify.
- `.actor/Dockerfile` — image utilisée pour le build Apify.

## Input attendu par l'Actor

Lovable envoie automatiquement ce JSON à chaque run :

```json
{
  "siteUrl": "https://site-b.example.com",
  "username": "admin",
  "password": "mot-de-passe-application",
  "loginPath": "/wp-admin",
  "cptSlug": "actualite",
  "duplicateStrategy": "skip",
  "article": {
    "title": "Titre de l'article",
    "slug": "titre-article",
    "content": "<p>Contenu HTML</p>",
    "excerpt": "Résumé",
    "date": "2026-06-30T10:00:00",
    "featuredImageUrl": "https://site-a.example.com/wp-content/uploads/image.jpg"
  }
}
```

Les secrets Site B (URL, username, password) ne sont **jamais stockés dans l'Actor** : ils sont passés par Lovable à chaque exécution.

## Output retourné

L'Actor pousse un seul item dans le dataset Apify :

```json
{ "ok": true, "skipped": false, "postUrl": "https://site-b.example.com/actualite/titre-article", "postId": 123 }
```

ou en cas d'échec :

```json
{ "ok": false, "error": "message lisible" }
```

## Déboguer un run

Dans la console Apify, cliquez sur le run. En cas d'erreur, vous trouverez :
- un screenshot `error-screenshot.png`
- le HTML de la page `error-page.html`
- les logs complets de Playwright.

## Prochaine étape

Copiez l'identifiant `votre-username~wp-site-b-publisher` affiché par `apify push` et transmettez-le à l'assistant pour qu'il l'enregistre comme secret `APIFY_ACTOR_ID` dans Lovable.
