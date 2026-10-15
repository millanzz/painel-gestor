# Publicar o Painel Gestor sem custo

Montagem para o piloto com o primeiro cliente, usando só planos grátis e **sem cartão de crédito**:

| Peça | Serviço | Plano grátis (confira, os planos mudam) |
|---|---|---|
| Aplicação (API + telas) | [Render](https://render.com) | 750 h/mês, dorme após 15 min sem acesso, disco apagado a cada reinício |
| Banco PostgreSQL | [Neon](https://neon.tech) | 1 GB por projeto, 100 horas de computação/mês, desliga sozinho após 5 min parado |
| Fotos e artes | o próprio banco (`STORAGE=banco`) | dentro do 1 GB do Neon (~250 KB por foto já comprimida) |
| Manter acordado | [cron-job.org](https://cron-job.org) | grátis |

> Por que não o banco do Render? O PostgreSQL grátis do Render **é apagado depois de 30 dias**. O do Neon é permanente.

Tempo estimado: 20 a 30 minutos.

---

## 1. Banco no Neon

1. Crie a conta em <https://neon.tech> (dá para entrar com o GitHub).
2. **Create project**:
   - Name: `painel-gestor`
   - Postgres version: 16 ou mais nova
   - Region: **AWS US East (N. Virginia)** (a mesma do Render; banco e aplicação longe um do outro deixam tudo lento)
3. Na tela do projeto, clique em **Connect** e copie a *connection string*. Ela tem esta cara:
   ```
   postgresql://neondb_owner:SENHA@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```
   Se vier com `&channel_binding=require` no fim, pode apagar esse pedaço.

Guarde essa string: é a `DATABASE_URL`. As tabelas são criadas sozinhas quando a aplicação sobe.

## 2. Aplicação no Render

1. Crie a conta em <https://render.com> entrando **com o GitHub** e autorize o acesso ao repositório `painel-gestor`.
2. **New → Web Service** → escolha `millanzz/painel-gestor`.
3. Preencha:
   - Name: `painel-gestor` (vira o endereço `https://painel-gestor.onrender.com`; se o nome estiver ocupado, o Render acrescenta letras)
   - Language: **Docker**
   - Branch: `main`
   - Region: **Virginia (US East)**
   - Instance type: **Free**
4. Em **Environment Variables**, adicione:

   | Nome | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | a string do Neon |
   | `JWT_SECRET` | um texto longo e aleatório (clique em *Generate*) |
   | `STORAGE` | `banco` |
   | `CRIAR_EXEMPLO` | `1` (cria a exibidora de exemplo para demonstração) |
   | `APP_URL` | deixe para depois do primeiro deploy |

5. Em **Advanced → Health Check Path**, coloque `/api/ping`.
6. **Create Web Service**. O primeiro build leva uns 5 minutos.
7. Quando aparecer *Live*, copie o endereço lá no topo (ex.: `https://painel-gestor.onrender.com`), volte em **Environment**, crie `APP_URL` com ele e salve. O Render reinicia sozinho.

> Alternativa: **New → Blueprint** lê o arquivo `render.yaml` do repositório e já cria o serviço com essas variáveis. Se o Blueprint pedir cartão, use o caminho manual acima.

Pronto: abra o endereço e entre com `admin@paineisabc.exemplo` / `painel123`.

A cada `git push` na `main`, o Render publica a nova versão sozinho.

## 3. Manter acordado (recomendado)

No plano grátis, o Render dorme depois de 15 minutos sem acesso, e o primeiro acesso depois disso demora **cerca de 1 minuto**. Na frente do cliente isso parece defeito. Além disso, as rotinas automáticas (opções vencendo, régua de cobrança, notas) só rodam com o servidor acordado.

1. Crie a conta em <https://cron-job.org>.
2. **Create cronjob**:
   - URL: `https://SEU-ENDERECO.onrender.com/api/ping`
   - Execution schedule: **a cada 10 minutos**
3. Salve.

O `/api/ping` responde sem consultar o banco, então o Neon continua desligando quando ninguém usa e as horas grátis dele não acabam. Um serviço acordado o mês todo gasta ~720 das 750 horas grátis do Render: dá para **um** serviço só.

## 4. Preparar a conta do cliente

1. Na tela de entrada, use **Criar conta** com o e-mail do dono da exibidora. A empresa nasce com 14 dias de teste.
2. Em **Administração → Importar**, suba a planilha de pontos e faces dele.
3. Em **Usuários**, convide a equipe com o perfil certo (comercial, financeiro, operação).
4. A "Painéis ABC (exemplo)" continua lá como área de testes. Quando não precisar mais, troque `CRIAR_EXEMPLO` para `0` e apague a empresa de exemplo.

## 5. Opcionais

- **E-mail de verdade** (recuperação de senha, convites): crie a conta no [Resend](https://resend.com), verifique um domínio seu e coloque `RESEND_API_KEY` e `EMAIL_FROM` no Render. Sem domínio próprio, o Resend só entrega para o seu próprio e-mail; até lá, os e-mails (inclusive o link de redefinição de senha) ficam registrados no log do Render, de onde você pode copiar o link.
- **Erros no Sentry**: crie um projeto Node no [Sentry](https://sentry.io) (plano grátis) e coloque `SENTRY_DSN`. Para os erros das telas, crie também `VITE_SENTRY_DSN` (projeto React) e faça um novo deploy.
- **Domínio próprio** (ex.: `app.seudominio.com.br`): Render → Settings → Custom Domains. Depois troque o `APP_URL`.
- **Fotos fora do banco** quando passar de algumas centenas de fotos: [Supabase Storage](https://supabase.com/docs/guides/storage/s3) (sem cartão) ou Cloudflare R2 (10 GB grátis, pede cartão). Coloque `STORAGE=s3`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY`. As fotos antigas continuam abrindo do banco.

## Cuidados do plano grátis

- **Backup**: o Neon grátis guarda pouco histórico. Faça backup em JSON pelo sistema (Configurações → Baixar backup) toda semana.
- **Espaço**: acompanhe o uso no painel do Neon. Perto de 1 GB, as gravações param; aí é hora de mover as fotos (item acima) ou assinar um plano.
- **Banda**: o plano grátis do Render inclui alguns GB de tráfego por mês. Para um piloto com um cliente, sobra.
- **Câmera e GPS** do celular só funcionam em `https`, o que o endereço do Render já tem.

## Quando virar cliente pagante

Render Starter (sem dormir, ~US$ 7/mês) + Neon Launch, ou um VPS com `docker compose --profile app up -d`. Nada no código muda, só as variáveis.
