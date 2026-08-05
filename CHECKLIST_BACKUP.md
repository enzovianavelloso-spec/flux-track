# Checklist de backup — Neon Postgres

Projeto Neon: `lively-hat-02811025` (org `org-gentle-feather-81268816`). Neon já faz backup
contínuo (point-in-time restore) nos planos pagos/free — confirmar plano atual antes de contar
só com isso.

## Backup manual (antes de qualquer migração arriscada ou mudança grande)

```bash
pg_dump "$DATABASE_URL" --format=custom --file=flux-track-backup-$(date +%Y%m%d).dump
```

- [ ] Rodar antes de qualquer `db:migrate` que altere/apague coluna existente (migrations
      que só adicionam tabela/coluna nova, como as até agora, são de baixo risco).
- [ ] Guardar o `.dump` fora da VPS (download local ou outro storage) — backup que mora no
      mesmo servidor não protege contra falha da VPS.

## Restore (se precisar)

```bash
pg_restore --clean --if-exists --dbname="$DATABASE_URL" flux-track-backup-YYYYMMDD.dump
```

- [ ] Testar restore num branch Neon separado antes de rodar contra produção
      (`neonctl branches create` ou pelo console Neon) — nunca testar restore direto em prod.

## Point-in-time restore (Neon nativo)

- [ ] Confirmar no console Neon (branch `main` do projeto `lively-hat-02811025`) até quanto
      tempo atrás dá pra restaurar no plano atual.
- [ ] Se precisar reverter um erro recente (ex.: migration ruim, delete errado), criar um
      branch Neon a partir de um timestamp anterior ao incidente, conferir os dados, só
      depois promover/apontar `DATABASE_URL` pra lá.

## O que NÃO depende de backup de banco

- Código: já está no git (`github.com/enzovianavelloso-spec/flux-track`).
- `.env`: nunca vai pro git — guardar uma cópia dos valores reais em lugar seguro (gerenciador
  de senha), não só na VPS.
