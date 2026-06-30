## Problème

Le contenu Site A contient des shortcodes WPBakery (`[vc_row]`, `[vc_column]`, `[vc_column_text]`, etc.) au début et à la fin. Site B ne charge pas WPBakery, donc ces balises s'affichent en texte brut dans l'article publié.

## Correctif (un seul endroit : `apify-actor/src/createPost.ts`, fonction `fillContent`)

Ajouter une étape de nettoyage du HTML avant l'insertion dans `textarea#content` :

1. **Supprimer toutes les balises shortcodes** (ouvrantes et fermantes) via regex :
   - `/\[\/?vc_[^\]]*\]/gi` → couvre `vc_row`, `vc_column`, `vc_column_text`, `vc_row_inner`, `vc_column_inner`, etc.
   - Générique aussi pour autres shortcodes courants WPBakery : `/\[\/?(vc_|wpb_)[^\]]*\]/gi`.
2. **Nettoyer les espaces/lignes vides** laissés en début/fin après suppression (`.trim()` + collapse de `\n\n\n+`).
3. Coller le HTML nettoyé dans `textarea#content` (onglet Code, logique existante inchangée).
4. Log : `[actor] Shortcodes WPBakery supprimés (N occurrences)`.

## Inchangé

Onglet Code activé, fallback JS, titre, slug, date ACF, image ACF, étiquettes, publication, auteur, login `/adsobra`, admin `/wp`.

## Déploiement

`git push` dossier `apify-actor` → rebuild Apify → relancer "Publier sur B".
