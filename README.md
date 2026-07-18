# Auren — Rotas do Horizonte

Jogo de tabuleiro online inspirado em exploração, comércio e construção de rotas. A aplicação usa React, TypeScript e um motor de regras determinístico; o servidor é autoritativo, portanto o navegador envia comandos e nunca grava recursos ou pontos diretamente.

## Cabe no Vercel Hobby gratuito?

Sim, para uso pessoal e não comercial, dentro das cotas do plano. A implantação não exige um plano Pro:

- frontend Vite e Functions no Vercel Hobby;
- WebSocket do Vercel Functions, disponível em beta público em todos os planos;
- integração Redis Free do Vercel Marketplace para estado ativo, sessões e pub/sub;
- Vercel Blob privado para snapshots duráveis de cada revisão;
- reconexão automática quando a Function WebSocket chega ao limite de 300 segundos do Hobby.

O Redis é uma integração nativa do Marketplace, provisionada e conectada pelo painel do Vercel, mas o serviço é entregue pela Redis. O plano Free não oferece persistência; por isso o Blob é obrigatório para recuperar partidas após perda do cache. Não há mensalidade enquanto as cotas gratuitas de Vercel, Redis e Blob forem respeitadas. Ao atingir uma cota, o recurso pode ser pausado até a renovação do período — o Hobby não deve ser tratado como infraestrutura com SLA.

Referências oficiais: [Hobby](https://vercel.com/docs/plans/hobby), [WebSockets](https://vercel.com/docs/functions/websockets), [Redis Marketplace](https://vercel.com/marketplace/redis/redis), [Vercel Blob](https://vercel.com/docs/vercel-blob) e [limites de Functions](https://vercel.com/docs/functions/limitations).

## Arquitetura

```text
Browser (React)
  ├─ HTTPS: criar/entrar na sala e enviar comandos
  └─ WebSocket: notificações, presença e chat
                │
Vercel Functions (motor autoritativo)
  ├─ Redis Free: CAS, sessão, estado ativo e pub/sub
  └─ Blob privado: snapshots room/revision e game/version
```

Proteções implementadas:

- token aleatório por jogador, armazenado no navegador e apenas como hash no servidor;
- payloads validados com Zod e limite de 16 KiB no WebSocket;
- `actorId` removido no cliente e reconstruído a partir da sessão no servidor;
- compare-and-set por versão para impedir dois comandos concorrentes;
- recursos e cartas de desenvolvimento dos adversários removidos da resposta;
- snapshots versionados para reconstruir Redis após reinício;
- mensagens renderizadas pelo React, sem HTML injetado.

## Implantar no Vercel Hobby

1. Envie este repositório para um provedor Git e importe o projeto no [Vercel](https://vercel.com/new).
2. Confirme o preset **Vite**. O `vercel.json` já define build, SPA rewrite, região única e os limites das Functions.
3. No projeto, abra **Storage → Marketplace**, instale **Redis**, selecione o plano **Free** e conecte-o ao projeto. A integração deve criar `REDIS_URL`.
4. Em **Storage**, crie um **Blob store privado** e conecte-o ao projeto. O painel injeta `BLOB_READ_WRITE_TOKEN` (ou as variáveis OIDC equivalentes em contas compatíveis).
5. Em **Settings → Functions**, mantenha **Fluid compute** habilitado. Ele já vem ativo por padrão em projetos novos e é necessário para WebSocket.
6. Adicione `VITE_MULTIPLAYER_MODE=online` aos ambientes Production e Preview. `VITE_REALTIME_URL` deve ficar vazio para usar automaticamente `wss://SEU-DOMINIO/api/ws`.
7. Faça um novo deploy e abra a URL em três navegadores ou dispositivos. Crie a sala, compartilhe o link, marque todos como prontos e inicie.

Escolha Redis e Blob na mesma região das Functions (`iad1`) quando o painel oferecer essa opção. Nunca copie tokens reais para `.env.example` ou para o Git.

## Desenvolvimento

Modo local, sem serviços externos:

```bash
pnpm install
pnpm dev
```

Modo online completo:

```bash
cp .env.example .env.local
vercel link
vercel env pull .env.local
pnpm dev:online
```

No PowerShell, use `Copy-Item .env.example .env.local` no lugar de `cp`. Confirme que `VITE_MULTIPLAYER_MODE=online` continua no arquivo depois de puxar as variáveis.

## Qualidade

```bash
pnpm test
pnpm test:coverage
pnpm lint
pnpm build
```

O modo online requer três ou quatro pessoas reais. O botão de preencher assentos com bots aparece apenas no modo local, evitando que uma aba tente possuir várias sessões da mesma sala.

## Limitações conscientes

- WebSocket ainda está em beta e a conexão é encerrada quando a Function atinge 300 segundos; o cliente reconecta, reassina a sala e recarrega o estado.
- O perfil é convidado e vive no navegador. Limpar o armazenamento local remove o token daquela sessão.
- O chat é efêmero no Redis e mantém as 100 mensagens mais recentes; snapshots de partida permanecem no Blob.
- Cada comando gera uma operação avançada no Blob. Para uso pessoal com amigos isso cabe nas cotas usuais, mas acompanhe **Usage** no painel antes de muitas partidas.
- O Hobby é destinado a projetos pessoais e não comerciais. Para monetização, SLA ou grande volume, será necessário rever o plano e a arquitetura.
