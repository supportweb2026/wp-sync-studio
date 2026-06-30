## Objectif

Le contenu est du HTML brut. On bascule explicitement sur l'onglet **Code** puis on colle le HTML dans `textarea#content`. On n'utilise plus TinyMCE (onglet Visuel par défaut) qui re-encode/casse le HTML.

## Correctif (un seul fichier : `apify-actor/src/createPost.ts`, fonction `fillContent`)

1. **Cliquer l'onglet "Code"** : `button#content-html` (fallback `.wp-switch-editor.switch-html`, ou par texte "Code"). Attendre `textarea#content` visible.
2. **Coller le HTML dans `textarea#content`** via `fill()`. Fallback `evaluate()` (set `value` + dispatch `input`/`change`) si `fill()` échoue.
3. **Ne pas retoucher TinyMCE** : on reste sur l'onglet Code jusqu'à la publication pour que WordPress enregistre le HTML tel quel.
4. Log : `[actor] Contenu collé via onglet Code (fill|js)`.

## Inchangé

Login `/adsobra`, admin `/wp`, titre, slug, date ACF, image ACF, étiquettes, publication, auteur, UI, Zod.

## Déploiement

`git push` dossier `apify-actor` → rebuild Apify → relancer "Publier sur B".
