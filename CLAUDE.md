# Notes pour travailler sur ce repo

## Scan automatique quotidien

`.github/workflows/ao-scan.yml` tourne tous les jours à 06h00 UTC et peut committer/pusher sur
`main` (`data/ao-history.json`, `rapport.html`). Avant de commencer à éditer ou de pousser quoi
que ce soit dans une session de travail, toujours faire :

```
git fetch origin
git status
```

Si `main` a divergé, `git pull --rebase origin main` avant de pousser — sinon le push est
rejeté (non-fast-forward) et il faut résoudre après coup, ce qui est plus pénible.

## Fichiers générés par le scan — ne pas laisser traîner de modifs locales dessus

`data/ao-history.json`, `data/scan-log.json`, `rapport.html` sont réécrits par `node index.js`
(à la main ou via le bot). Si vous lancez un scan en local pour tester, committez ou annulez le
résultat tout de suite (`git checkout -- <fichier>`) — sinon ces modifications non commitées
entrent en conflit avec le prochain scan automatique poussé par le bot.

## Ne committer que ce qui a été explicitement demandé/validé dans la session en cours

Ce repo a régulièrement des fichiers modifiés en local qui ne font pas partie de la tâche en
cours (scans de test, etc.). Ne pas les inclure dans un commit sans consulter l'utilisateur.
