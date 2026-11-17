# Especificação do produto

## Visão
Experiência simples para que um grupo pequeno entre em um servidor Minecraft Java/Bedrock sem exigir que ele fique ligado o tempo todo.

## Escopo inicial
- Até 10 jogadores simultâneos.
- Uma única instância de mundo.
- Java Edition por Paper.
- Bedrock Edition por GeyserMC e Floodgate.
- Site local durante desenvolvimento; site público e domínio serão definidos futuramente.
- Execução local no PC durante desenvolvimento.
- Preparação para migração a VPS Linux/EC2 sem dependência exclusiva de provedor.

## Jornada do jogador
1. Jogador abre o site e solicita entrada.
2. API verifica status e capacidade.
3. Se desligado, uma solicitação idempotente é enviada ao Controller.
4. Jogador acompanha estados de preparação e espera.
5. Quando pronto e com vaga/reserva válida, recebe host, porta e instruções Java/Bedrock.
6. Jogador abre Minecraft e conecta pelo próprio jogo.

O navegador não consegue iniciar o cliente Minecraft de forma universal. Links de protocolo podem ser uma conveniência opcional e específica de plataforma.

## Estados operacionais
OFFLINE, START_REQUESTED, STARTING, LOADING_WORLD, VERIFYING_CONNECTION, ONLINE, IDLE, STOPPING e ERROR.

A prontidão deve ser confirmada por sinal real do servidor, não somente pelo processo Java estar ativo.

## Fila e capacidade
- Fila gerenciada pela API e persistida no banco.
- Uma instância Minecraft; fila não cria instâncias extras.
- Máximo inicial de 10 jogadores simultâneos.
- Reservas expiram e devem ser consumidas/renovadas com segurança.
- Tratar pedidos duplicados, spam, falhas e timeouts.
- Estado da fila sobrevive a reinicialização da API.

## Desligamento automático
Comportamento configurável: quando não houver jogadores durante uma janela de ociosidade, avisar antes de desligar, permitir cancelamento se alguém entrar, salvar mundo e realizar backup. Tempo exato e período de aviso ainda precisam ser aprovados.

## Segurança
- Nenhuma senha Microsoft é solicitada pelo site.
- Autenticação de jogo ocorre dentro do Minecraft.
- Floodgate facilita integração Bedrock sem exigir conta Java, mas não substitui autenticação normal da plataforma Bedrock.
- API de controle privada; operações administrativas protegidas.
- Segredos somente em variáveis de ambiente/secret manager.
- Backups protegidos e política de retenção documentada.

## Fora do escopo inicial
- Rede de múltiplos servidores/mundos.
- Kubernetes e balanceamento horizontal.
- Login Microsoft pelo site.
- Garantia de abertura automática do Minecraft pelo navegador.
- Hospedagem pública antes de validar a experiência local.
