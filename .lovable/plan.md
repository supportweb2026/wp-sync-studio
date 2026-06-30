## Action

1. Mettre `login_path = ''` directement en base pour toutes les connexions Site B existantes (table `wp_connections`, role = `destination`) via une requête SQL ponctuelle — pas besoin que vous re-saisissiez quoi que ce soit.
2. Déclencher un run Apify de test (`login-check`) sur votre compte pour vérifier que le login passe maintenant que l'Actor va directement sur `https://sobraga.com/adsobra`.
3. Vous rapporter le résultat (succès / message d'erreur précis / lien vers la capture du run).

## Pré-requis côté vous

L'Actor doit avoir été redéployé (`cd apify-actor && apify push`) avec les changements du tour précédent. Sans ça, l'ancien code tournera encore et le test échouera de la même façon.

Confirmez-moi que l'`apify push` a bien été fait et je lance.
