# Landing produit — Thème Horizon

Template produit « landing » (une page = un produit), ajouté au thème Horizon 4.1.5.
Tout est éditable depuis l'éditeur de thème, sans toucher au code.

## 1. Installation

1. Importer le thème (`horizon-landing.zip`) dans **Boutique en ligne › Thèmes › Ajouter un thème › Importer un fichier ZIP**
   (ou connecter ce dépôt GitHub au thème).
2. Ouvrir le produit dans l'admin › **Modèle de thème** › choisir **`product.landing`**.
3. Créer les metafields (§ 3) puis personnaliser via **Personnaliser** › choisir le modèle de produit « landing ».

## 2. Configuration du produit

### Options de variantes

| Option | Valeurs | Remarque |
| --- | --- | --- |
| `Coloris` | Noir, Blanc, Gris, Violet | Noms acceptés : *Coloris, Couleur, Color* (réglable dans la section) |
| `Pack` | Console seule, Pack Protection, Pack Complet | Noms acceptés : *Pack, Offre, Bundle* |

Créer les 12 variantes (4 coloris × 3 packs) avec **prix** et **prix avant réduction** :

| Pack | Prix | Prix avant réduction |
| --- | --- | --- |
| Console seule | 29,99 € | 89,99 € |
| Pack Protection | 39,99 € | 129,99 € |
| Pack Complet | 49,99 € | 179,99 € |

Le prix du CTA, le prix barré, le pourcentage de remise (badge et pastille) et le prix de chaque carte pack
sont lus sur la variante sélectionnée : rien n'est codé en dur.

Les cartes de pack sont décrites par les blocs **Pack** de la section « Landing — Produit (hero) » ;
le champ *Valeur de l'option « Pack »* doit correspondre exactement à la valeur de variante.

### Images par coloris

Équivalent des dossiers `images-noir/`, `images-blanc/`… du site d'origine : chaque image du produit est rattachée
à un coloris par son **texte alternatif**, qui doit **commencer par le nom du coloris** :

- `Noir`, `Noir - dos`, `Noir - écrans` → affichées quand « Noir » est sélectionné ;
- une image sans coloris dans son texte alternatif est affichée pour **tous** les coloris ;
- à défaut, l'image associée à la variante est utilisée.

Les pastilles rondes de coloris utilisent la pastille Shopify (si définie), sinon la première image du coloris.
Format conseillé : `.webp` (Shopify sert de toute façon automatiquement du WebP/AVIF selon le navigateur).

### Stock affiché (« Seulement X pièces disponibles »)

- Si l'inventaire de la variante est **suivi par Shopify** : le vrai stock est affiché, uniquement sous le seuil
  réglé dans la section (20 par défaut).
- Sinon : valeur du metafield `custom.urgency_stock`.

## 3. Metafields produit

Admin › **Paramètres › Données personnalisées › Produits › Ajouter une définition** :

| Nom | Espace de noms et clé | Type | Exemple |
| --- | --- | --- | --- |
| Badge | `custom.badge_text` | Texte sur une ligne | `DÉSTOCKAGE −67%` (sinon calculé : « DÉSTOCKAGE −XX% ») |
| Sous-titre | `custom.subtitle` | Texte sur une ligne | `Console portable double écran AMOLED · Snapdragon 8 Gen 2 · Android 13` |
| Stock restant | `custom.urgency_stock` | Nombre entier | `7` |
| Nombre d'avis | `custom.review_count` | Nombre entier | `860` |
| Note moyenne | `custom.review_score` | Nombre décimal | `4.7` |
| Comparatif | `custom.comparison_data` | JSON | voir ci-dessous |
| FAQ | `custom.faq_data` | JSON | voir ci-dessous |
| Avis clients | `custom.reviews_data` | JSON | voir ci-dessous |

Note et nombre d'avis : si `custom.review_score` / `custom.review_count` sont vides, les metafields standards
`reviews.rating` / `reviews.rating_count` (renseignés par les apps d'avis : Judge.me, Shopify Product Reviews…)
sont utilisés. Sans aucune donnée, les blocs de note sont masqués.

Les sections FAQ, comparatif et avis utilisent le metafield s'il est rempli, **sinon leurs blocs** (éditables dans
l'éditeur). Le template est livré avec 9 questions et 10 lignes de comparatif en blocs.

### `custom.comparison_data`

```json
{
  "columns": ["AYN Thor", "Steam Deck", "Switch OLED"],
  "rows": [
    { "label": "Double écran", "cells": [true, false, false] },
    { "label": "Processeur", "cells": ["Snapdragon 8 Gen 2", "AMD APU (Zen 2)", "NVIDIA Tegra X1"] },
    { "label": "RAM", "cells": ["16 Go", "16 Go", "4 Go"] },
    { "label": "Stockage", "cells": ["1 To", "512 Go – 1 To", "64 Go"] },
    { "label": "Écran 120 Hz", "cells": [true, false, false] },
    { "label": "Format clapet", "cells": [true, false, false] },
    { "label": "Cloud Gaming", "cells": [true, true, false] },
    { "label": "Sticks Hall Effect", "cells": [true, false, false] },
    { "label": "Poids", "cells": ["", "≈ 640 g", "≈ 420 g"] },
    { "label": "Prix", "cells": ["[prix]", "569 €", "349,99 €"] }
  ]
}
```

`true` / `false` (ou « oui » / « non ») → ✓ vert / ✗ rouge. `[prix]` → prix actuel du produit. Cellule vide → « — ».
⚠️ Le poids de l'AYN Thor n'est pas renseigné : complétez-le avec la valeur officielle, et vérifiez les prix concurrents.

### `custom.faq_data`

```json
[
  { "question": "Quand vais-je recevoir ma commande ?", "answer": "<p>Expédiée sous 24h, livrée en 3 à 5 jours ouvrés.</p>" },
  { "question": "Puis-je retourner la console ?", "answer": "<p>Oui, retour gratuit sous 30 jours.</p>" }
]
```

### `custom.reviews_data`

```json
[
  {
    "name": "Prénom N.",
    "rating": 5,
    "text": "Texte de l'avis client.",
    "city": "Lyon",
    "pack": "Pack Complet",
    "color": "Noir",
    "verified": true
  }
]
```

Aucun avis n'est livré avec le thème : publiez uniquement de vrais avis clients, et `"verified": true`
seulement pour un achat réel (même règle pour la case « Achat vérifié » des témoignages vidéo).

## 4. Fichiers

| Fichier | Rôle |
| --- | --- |
| `layout/landing.liquid` | Layout dédié : CSS critique inline, CSS secondaire non bloquant, JS `defer`, sans le JS d'Horizon |
| `templates/product.landing.json` | Template produit (ordre des sections + contenu par défaut) |
| `sections/landing-header-group.json` | Groupe en-tête : annonce + navigation (sticky) |
| `sections/landing-footer-group.json` | Groupe pied de page : footer + panier coulissant |
| `sections/landing-announcement-bar.liquid` | 1. Barre d'annonce + compte à rebours |
| `sections/landing-header.liquid` | 2. Navigation, panier, menu burger mobile |
| `sections/product-hero.liquid` | 3. Section produit + barre CTA mobile sticky |
| `sections/video-hero.liquid` | 4. Vidéo « La DS du futur, entre vos mains » + badge de note |
| `sections/video-testimonials.liquid` | 5. Carrousel de témoignages vidéo |
| `sections/specs-grid.liquid` | 6. Grille bento « Ce qui la rend unique » |
| `sections/comparison-table.liquid` | 7. Comparatif « Pourquoi l'AYN Thor » |
| `sections/reviews-grid.liquid` | 8. Avis clients |
| `sections/faq-accordion.liquid` | 9. FAQ en accordéon |
| `sections/bottom-cta.liquid` | 10. CTA finale |
| `sections/landing-footer.liquid` | 11. Pied de page |
| `sections/landing-cart-drawer.liquid` | 12. Panier coulissant (AJAX) |
| `snippets/lp-*.liquid` | Icônes, étoiles, compte à rebours, vidéo lazy, cartes d'avis, lignes de panier… |
| `assets/landing.css` / `assets/landing.js` | Styles secondaires / JavaScript vanilla (custom elements) |
| `config/settings_schema.json` | Nouveau groupe **Landing produit** (couleurs, arrondis, largeur) |

Couleurs, arrondis et largeur : **Réglages du thème › Landing produit**. Polices : **Réglages du thème › Typographie**
(les variables CSS d'Horizon sont réutilisées).

Vidéos : réglage « Vidéo (hébergée sur Shopify) » ou URL MP4 du CDN Shopify. Elles ne sont chargées qu'à
l'approche de l'écran et mises en pause hors écran. Hors éditeur, les cartes vidéo / images sans média sont masquées.

## 5. Bon à savoir (réglementation)

- **Compte à rebours** : le mode par défaut repart chaque jour à minuit. En France/UE, un compte à rebours ou une
  rareté qui ne correspondent pas à la réalité constituent une pratique commerciale trompeuse : utilisez le mode
  **« Date de fin fixe »** pour une vraie fin d'offre.
- **Prix barré** : le prix de référence doit être le prix le plus bas pratiqué sur les 30 jours précédant la réduction
  (directive Omnibus, art. L112-1-1 du Code de la consommation).
- **Avis** : affichez la façon dont les avis sont contrôlés (art. L111-7-2 du Code de la consommation).
  N'utilisez le logo d'une plateforme d'avis (ex. Trustpilot) que si la note vient réellement de cette plateforme ;
  le plus simple est d'y coller le widget officiel (champ « Widget d'avis » de la section Vidéo).
