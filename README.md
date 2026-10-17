# Dr Life — Tlemcen · site + prise de rendez-vous en ligne + espace praticien

Site vitrine premium (une page + espace d’administration) pour **Dr Life**, accompagnement de **Younes Bendi**, coach & praticien en PNL, à Tlemcen (en cabinet ou en ligne).
« Dr » est le nom de la marque : le site n’affirme aucun doctorat médical.

- Site : https://sayler991.github.io/Dr_Life_site/
- Espace praticien : https://sayler991.github.io/Dr_Life_site/admin/ (compte propriétaire `benduy0@gmail.com`, table partagée `public.owners`)

## Faits fournis (non inventés)
- Nom de marque Dr Life, praticien Younes Bendi, téléphone 0552 99 84 11 (+213 552 99 84 11), WhatsApp https://wa.me/213552998411.
- Lieu : « Tlemcen — en cabinet ou en ligne » (adresse exacte non communiquée, indiquée « communiquée à la confirmation »).
- Thèmes : coaching inspiré des neurosciences, PNL, stress, anxiété, confiance, habitudes, émotions, sommeil, motivation, couple/communication, hypnose/relaxation guidée, visualisation.

## Ce qui est volontairement absent / à compléter dans l’admin
- Aucun diplôme, certification, nombre d’années, statistique, avis ou note : rien n’a été inventé.
- « Parcours & formations » (À propos) : vide → masqué sur le site.
- Témoignages : liste vide → la section est masquée tant qu’aucun témoignage réel n’est ajouté.
- Tarifs : « Tarif sur demande » partout (modifiable par accompagnement).
- E-mail de contact : vide (facultatif).
- Textes (accroches, descriptions des accompagnements, FAQ, à propos) : rédaction de la maquette, sans promesse de guérison ; à relire par le praticien.
- Avertissement : « ne remplace pas un suivi médical, psychologique ou psychiatrique… En cas d’urgence, appelez le 14 (Protection civile) ou rendez-vous aux urgences ». NB : en Algérie le **14** est le numéro de la Protection civile (secours) ; le SAMU a des numéros locaux. Le texte est modifiable.

## Photos — licence Pexels (usage libre, commercial compris, attribution facultative)
Converties en WebP 480 / 800 / 1200 px, chargement différé (sauf la photo du haut de page).
| clé | sujet | auteur | lien |
|---|---|---|---|
| hero | pièce lumineuse, fauteuil et plantes | Kelvin Linhares | https://www.pexels.com/photo/armchair-and-plants-in-room-16800640/ |
| approche | visage les yeux fermés dans un rayon de lumière | Santiago Sauceda González | https://www.pexels.com/photo/young-woman-sitting-with-eyes-closed-and-rays-of-sun-shining-on-her-face-19458596/ |
| cabinet | échange en face à face | Timur Weber | https://www.pexels.com/photo/a-man-sitting-on-a-chair-listening-to-the-woman-talking-8560685/ |
| visio | séance en visio depuis un canapé | Kaboompics.com | https://www.pexels.com/photo/woman-looking-at-the-laptop-screen-7195087/ |
| telephone | appel près d’une fenêtre | Jessica Ticozzelli | https://www.pexels.com/photo/young-asian-woman-speaking-on-smartphone-near-window-4333579/ |
| apropos | carnet, lunettes, thé | Marie Martin | https://www.pexels.com/photo/desk-notebook-writing-pencil-7190719/ |

Polices : Cormorant Garamond + DM Sans (SIL Open Font License), auto-hébergées. Motif neurones/synapses : SVG dessiné pour le site.

## Fonctionnement
- `index.html` est **prérendu** depuis `content.json` (`node tools/build.js`) : lisible sans JavaScript et par Google.
- `assets/js/live.js` charge le contenu en direct depuis Supabase (`drlife.site_content`), avec `content.json` en secours.
- Réservation : accompagnement → format (cabinet / visio / téléphone) → calendrier → créneau libre → nom, téléphone, e-mail (facultatif), message → confirmation avec **numéro de réservation** (DL-XXXXX), bouton **« Confirmer sur WhatsApp »** (message prérempli) et fichier agenda (.ics).
- Mouvement réduit respecté (`prefers-reduced-motion`), mobile d’abord (testé à 375 px), pas de défilement horizontal.

## Supabase (projet `rvreusugrtiubqtafgbk`, schéma `drlife`)
`supabase/schema.sql` puis `supabase/seed.sql` (idempotents). `drlife` a été **ajouté** à la liste des schémas exposés (liste existante relue puis complétée).
- Tables : `site_content` (+ `site_content_history`, 50 versions), `settings` (semaine type, durée, délai, horizon, ouverture), `blocked_dates`, `appointments`.
- Par défaut : samedi → jeudi 09:00–12:00 et 14:00–18:00, vendredi fermé, séances de 60 min, délai minimum 2 h, réservable 60 jours à l’avance (fuseau Africa/Algiers).
- Public : lecture du contenu, des réglages et des jours bloqués (sans motif) ; appel de `get_slots(date, date)` (créneaux libres uniquement, aucune donnée client) et `book_appointment(jsonb)` (SECURITY DEFINER). **Aucune lecture ni écriture directe des rendez-vous.**
- Anti double réservation côté serveur : index unique partiel sur l’heure de début (hors annulés) **et** contrainte d’exclusion anti-chevauchement ; la fonction revérifie que le créneau fait partie des créneaux libres.
- Validation serveur : accompagnement actif, format autorisé, créneau valide (horaires, dates bloquées, délai, horizon), nom 2–80, téléphone, e-mail, message ≤ 1000, pot de miel.
- Limites : 20 réservations / 10 min au total, 3 rendez-vous à venir par téléphone, 6 réservations / heure par connexion (IP hachée).
- RLS : tout le reste réservé à `public.is_owner()`. Realtime activé sur `appointments`. Photos de l’admin : bucket public `images`, préfixe `up-drlife_`.

## Espace praticien (/admin/)
Rendez-vous (filtres à venir / statut / aujourd’hui / passés / dates / recherche, statuts en attente · confirmé · annulé · terminé, lien WhatsApp prérempli vers chaque client, appel, e-mail, note privée, ajout manuel, suppression), Calendrier mensuel, Disponibilités (semaine type, durée, délai, horizon, ouverture/fermeture, dates bloquées), Textes du site, Accompagnements & tarifs, FAQ, Témoignages, Photos, Historique + restauration.
`alerts.js` : temps réel + relève toutes les 30 s, son, bannière, pastille, titre d’onglet, notification du navigateur (bouton « Activer les alertes »).

## Tests
- `node tools/e2e.js https://sayler991.github.io/Dr_Life_site/ /workspace/drlife_shots/` — 1440 et 375 px, réservations « TEST E2E » réelles (supprimées ensuite), double réservation refusée, mouvement réduit, admin (mauvais mot de passe refusé).
- `node tools/admin_preview.js BASE OUT` — aperçu de chaque onglet de l’admin avec un faux client et des données fictives (sans connexion réelle).
