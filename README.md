# SolBacktest

SolBacktest est une application statique pour recevoir des demandes de backtest copy-trading, les stocker dans Supabase, puis afficher les résultats calculés plus tard par ton PC.

Le principe :

1. Ton ami ouvre le site.
2. Il crée un bundle avec un nom et une liste de wallets Solana.
3. Supabase stocke la demande avec `status = pending`.
4. Quand ton PC est allumé, `worker/main.py` récupère la demande.
5. Le worker passe le bundle en `processing`, lance un faux simulateur Python, puis écrit `status = completed` avec les stats.
6. Ton ami revient sur le site et clique sur `View Results`.

## Pages

- `#/` : vue d’ensemble des bundles, états et boutons résultats.
- `#/create` : création d’un bundle, avec un bouton `+` pour ajouter des lignes wallet.
- `#/results/:id` : page statistiques avec courbes multi-stratégies, tableau récapitulatif et meilleure stratégie.

## Fichiers

- `index.html` : structure HTML en UTF-8.
- `styles.css` : design sombre inspiré des trois maquettes.
- `app.js` : navigation, création des bundles, lecture Supabase et affichage des stats.
- `assets/solana-official-logo.svg` et `assets/solana-official-mark.svg` : logos officiels Solana.
- `assets/fonts/` : police Diatype utilisée par solana.com.
- `config.js` : configuration publique Supabase du front.
- `supabase.sql` : table et policies minimales.
- `worker/main.py` : worker local avec faux simulateur de stratégie.
- `worker/requirements.txt` : dépendance Python Supabase.

## Tester sans Supabase

Ouvre directement `index.html` dans ton navigateur.

Si `config.js` est vide, le site démarre en mode démo local avec trois bundles exemples :

- un bundle terminé,
- un bundle en cours,
- un bundle en attente.

## Créer Supabase

1. Crée un projet Supabase.
2. Ouvre le SQL Editor.
3. Colle et exécute le contenu de `supabase.sql`.
4. Va dans Project Settings, puis API.
5. Copie :
   - `Project URL`,
   - `anon public key`,
   - `service_role key`.

La clé `anon` peut être utilisée dans le navigateur si Row Level Security est activé. La clé `service_role` ne doit jamais être mise dans le front, car elle contourne les règles RLS.

## Activer la connexion

L’app utilise Supabase Auth avec email + mot de passe.

Dans Supabase :

1. Va dans `Authentication > Providers`.
2. Active `Email`.
3. Pour un prototype avec un ami, tu peux désactiver temporairement `Confirm email` afin que le compte soit utilisable tout de suite.
4. Crée les comptes autorisés depuis `Authentication > Users`.

Le SQL ajoute `user_id` sur chaque analyse. Un utilisateur connecté ne peut lire que ses propres bundles.

Par défaut, l’inscription publique est désactivée côté front avec `ALLOW_SIGNUPS: false` dans `config.js`. Si tu veux afficher le bouton `Créer un compte` sur la page de connexion, passe cette valeur à `true`.

## Configurer le front

Dans `config.js`, mets :

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://TON_PROJET.supabase.co",
  SUPABASE_ANON_KEY: "TA_CLE_ANON_PUBLIC",
  ALLOW_SIGNUPS: false
};
```

## Lancer le worker local

Depuis ce dossier :

```powershell
cd worker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:SUPABASE_URL="https://TON_PROJET.supabase.co"
$env:SUPABASE_SERVICE_KEY="TA_CLE_SERVICE_ROLE"
python main.py
```

Le worker tourne en boucle. Dès qu’il trouve une ligne `pending`, il génère des résultats de simulation et remplit Supabase.

Pour tester seulement le faux simulateur sans Supabase :

```powershell
python main.py --demo
```

## Remplacer le faux simulateur

Dans `worker/main.py`, remplace seulement cette fonction :

```python
def run_copy_trading_backtest(name: str, wallets: list[str]) -> dict[str, Any]:
    ...
```

Elle doit retourner un JSON de ce type :

```python
{
    "summary": {
        "total_pnl_percent": 31.6,
        "total_trades": 465,
        "win_rate": 68.4,
        "average_roi": 18.1,
        "best_strategy": "Conservative Growth",
        "worst_strategy": "Martingale",
        "max_drawdown": 21.4,
    },
    "strategies": [
        {
            "id": "conservative_growth",
            "name": "Conservative Growth",
            "pnl_percent": 24.91,
            "trades": 127,
            "win_rate": 85,
            "roi_percent": 23.26,
            "average_trade_percent": 0.1961,
            "max_drawdown": 4.5,
        }
    ],
    "charts": {
        "balance_curves": [
            {
                "strategy": "Conservative Growth",
                "color": "#a77dff",
                "points": [
                    {"timestamp": "2026-01-01", "value": 1000},
                    {"timestamp": "2026-01-02", "value": 1040},
                ],
            }
        ]
    },
    "logs": [],
}
```

## Mettre en production gratuitement

Option simple recommandée : Netlify ou Vercel.

1. Mets ce dossier dans un dépôt GitHub.
2. Connecte le dépôt à Netlify ou Vercel.
3. Comme c’est un site statique pur, il n’y a pas de commande de build.
4. Le dossier de publication est la racine du projet.
5. Déploie.
6. Donne l’URL à ton ami.
7. Laisse le worker tourner sur ton PC quand tu veux traiter les demandes.

Alternative GitHub Pages :

1. Mets les fichiers à la racine d’un dépôt GitHub public.
2. Va dans `Settings > Pages`.
3. Choisis la branche et le dossier racine.
4. GitHub publie les fichiers HTML/CSS/JS directement.

## Production plus propre

Pour un vrai usage, ajoute ensuite :

- authentification Supabase,
- policies RLS par utilisateur,
- une colonne `owner_id`,
- un bouton de suppression de bundle,
- un export CSV,
- un petit service Windows ou une tâche planifiée pour démarrer le worker automatiquement quand ton PC s’allume.

Sources utiles :

- Supabase explique que la clé `anon` est utilisable côté navigateur avec RLS, mais que la clé `service_role` ne doit jamais être utilisée dans un navigateur : https://supabase.com/docs/guides/functions/secrets
- GitHub Pages héberge des fichiers HTML, CSS et JavaScript depuis un dépôt : https://docs.github.com/pages/getting-started-with-github-pages/what-is-github-pages
- Netlify permet de déployer depuis un dépôt Git : https://docs.netlify.com/start/quickstarts/deploy-from-repository/
- Vercel déploie depuis GitHub, GitLab, Bitbucket ou Azure DevOps : https://vercel.com/docs/deployments/deployment-methods
"# solbacktest" 
