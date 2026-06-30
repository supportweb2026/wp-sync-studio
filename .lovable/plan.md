## Réponse courte

Les 418 articles ne sont stockés nulle part dans l'app — ils restent sur le Site A. L'app les **lit à la demande** via l'API REST et les affiche dans la page **Comparaison** (`/comparison`), une ligne par article, avec leur état vis-à-vis du Site B (présent/absent/différent).

Aujourd'hui rien sur le Dashboard ne renvoie clairement vers cette liste, d'où ta confusion. La carte "Articles Site A — 418" est juste un compteur statique.

## Ce que je propose

Petites améliorations UX pour rendre la liste des 418 articles évidente, sans changer la logique métier.

### 1. Dashboard
- Rendre la carte "Articles Site A" cliquable → navigue vers `/comparison`.
- Ajouter sous la carte un lien explicite "Voir la liste des articles →".
- Ajouter une mini-explication : "Les articles restent sur le Site A. L'app les lit en direct via REST pour comparer et publier."

### 2. Page Comparaison
- Si Site B n'est pas encore lu (Apify pas lancé), afficher quand même les 418 articles du Site A avec l'état "Absent de B" par défaut, au lieu du message "Configurez les connexions" quand seul B manque.
- Ajouter un bouton "Charger uniquement Site A" pour voir la liste sans attendre Apify.

### 3. Menu latéral
- Renommer "Comparaison" en "Articles & comparaison" pour qu'on comprenne que c'est là que vit la liste.

## Détails techniques

- `src/routes/_authenticated/dashboard.tsx` : envelopper `StatCard "Articles Site A"` dans un `<Link to="/comparison">`, ajouter une ligne d'aide.
- `src/lib/wordpress/wp.functions.ts` → `fetchComparison` : si Site A configuré mais pas Site B, retourner `rows` = articles A avec `state: "only_on_source"` et `destinationSource: "none"` au lieu de `notConfigured: true`.
- `src/routes/_authenticated/comparison.tsx` : retirer la branche `notConfigured` quand seul A est dispo ; afficher une bannière douce "Site B non lu — lancer Apify pour comparer".
- `src/components/layout/AppShell.tsx` : libellé de l'entrée menu.

Aucun changement de schéma DB, aucun appel Apify nouveau, aucune migration.
