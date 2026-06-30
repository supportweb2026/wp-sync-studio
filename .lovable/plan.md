Le problème n'est pas WordPress ni vos identifiants : l'Actor Apify démarre, mais le navigateur Playwright ne trouve pas le bon Chromium. La cause restante est le `package-lock.json` : même si `package.json` a été corrigé, le lockfile contient encore `playwright: ^1.48.0`, donc Apify continue probablement à réinstaller une version incompatible.

Plan de correction ciblé :

1. Corriger le lockfile Apify
   - Mettre `apify-actor/package-lock.json` en cohérence avec `apify-actor/package.json`.
   - Supprimer toute dépendance directe à `playwright` dans la racine du lockfile.
   - Garder seulement `apify`, `typescript` et les dépendances nécessaires au build.

2. Ne plus dépendre du Chromium Playwright téléchargé
   - Modifier le lancement navigateur dans `apify-actor/src/actor.ts` pour utiliser explicitement le Chrome fourni par l'image Apify : `/usr/bin/google-chrome` via `APIFY_CHROME_EXECUTABLE_PATH`.
   - Cela évite définitivement l'erreur `/pw-browsers/chromium_headless_shell-1228/... Executable doesn't exist`.

3. Rendre l'erreur de build/run plus lisible
   - Ajouter un log au démarrage indiquant le chemin navigateur utilisé.
   - Si Chrome est absent, l'Actor échouera avec un message clair au lieu d'une erreur Playwright confuse.

4. Étapes après implémentation
   - Vous devrez seulement pousser les changements sur GitHub pour relancer le build Apify.
   - Puis tester depuis l'app avec “Tester la connexion” ou publier un article.

Ce plan est volontairement minimal : pas de refonte, pas de changement UI, pas de nouvelle fonctionnalité — uniquement la correction de l'erreur Apify actuelle.