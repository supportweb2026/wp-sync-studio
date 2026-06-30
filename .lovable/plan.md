## Problème

Vous êtes bloqué sur `/auth` sans pouvoir vous reconnecter. L'app n'a actuellement aucun flux "mot de passe oublié".

## Plan

1. **Ajouter un lien "Mot de passe oublié ?"** sur `src/routes/auth.tsx` qui ouvre un petit formulaire (email) appelant :
   ```ts
   supabase.auth.resetPasswordForEmail(email, {
     redirectTo: `${window.location.origin}/reset-password`,
   })
   ```
   Toast de confirmation "Email envoyé si le compte existe".

2. **Créer la route publique `src/routes/reset-password.tsx`** :
   - Détecte le `type=recovery` dans le hash (Supabase établit la session automatiquement).
   - Formulaire « nouveau mot de passe » → `supabase.auth.updateUser({ password })`.
   - Redirige vers `/dashboard` après succès.
   - Route hors de `_authenticated` pour rester accessible sans session active.

3. **Solution immédiate** (en parallèle, pour débloquer maintenant) : je peux aussi, si vous préférez, vous renvoyer un email de reset tout de suite via le backend dès que le flux est en place — ou simplement recréer un compte avec un autre email.

Rien d'autre n'est modifié (connexions WP, Apify, journal restent intacts).

## Question

Confirmez-vous l'ajout du flux complet (lien + page `/reset-password`) ? L'email de récupération sera envoyé à l'adresse que vous saisirez sur l'écran de connexion.