# Tormenta20 — Baú do Grupo v1.8.7

## Fase 5 — Inventário, moedas e sincronização

## Fase 5 — Inventário com quantidade

A camada de inventário agora trata quantidade de forma uniforme nos dois sentidos.

### Ficha → Baú

- solicita a quantidade antes da transferência;
- reduz `system.qtd` quando a transferência é parcial;
- remove o Item do Actor somente quando a quantidade chega a zero;
- consolida com uma pilha equivalente no Baú;
- registra uma única movimentação.

### Baú → Ficha

- pode ser feito arrastando o item do Baú para a ficha;
- também pode ser feito pelo botão de retirar;
- solicita a quantidade;
- reduz a pilha do Baú;
- soma à pilha existente na ficha quando o Item é equivalente;
- cria um Item quando necessário;
- possui compensação se a alteração no destino falhar.

### Baú → Lixo

Cada item possui um botão de descarte. O descarte também solicita quantidade e registra:

`action: "discard"`

O item nunca é enviado para uma ficha.

### Pilhas

O `stableItemKey` agora ignora `system.qtd`, permitindo consolidar itens iguais mesmo quando suas quantidades de origem são diferentes.

Itens antigos são normalizados na inicialização do módulo, consolidando duplicatas equivalentes.

### Foundry VTT

Compatibilidade alvo: Foundry VTT V13 + Tormenta20 1.5.x.

A integração com a ficha usa o hook nativo `dropActorSheetData` do Foundry para receber itens arrastados do Baú.


### Moedas compartilhadas

- Jogadores podem depositar e retirar moedas do Baú usando seus próprios personagens.
- A persistência do patrimônio compartilhado é feita pelo Mestre por meio do canal de socket do módulo; jogadores não tentam atualizar diretamente a configuração mundial do Foundry.
- Cada movimentação de moeda registra o usuário que realizou a operação (`userName`) e, quando aplicável, o personagem envolvido.
- Alterações persistidas pelo Mestre são propagadas automaticamente para as demais instâncias abertas do Baú.

### Diagnóstico da v1.8.7

A versão mantém o core de inventário da v1.8.6 e adiciona apenas a camada de autorização/sincronização necessária para o patrimônio compartilhado de moedas e a identificação do usuário no histórico.


## v1.8.9

O Baú é funcionalmente compartilhado: qualquer jogador pode movimentar itens e moedas. A persistência do World Setting continua sendo feita pelo endpoint técnico do Mestre ativo, exigência do Foundry VTT para World Settings; isso não é uma permissão funcional do Baú.


## v1.8.10
- Corrige a identificação da autoridade técnica do socket em Foundry V13 para mutações solicitadas por jogadores.
- Mantém o Baú sem restrição funcional por ser jogador ou Mestre; o GM ativo é apenas o executor técnico da persistência do World Setting.
- Histórico de moedas agora exibe também o personagem de destino/origem em operações `actor-to-chest-currency` e `chest-to-actor-currency`.


## v1.9.0
- O Baú passa a ser guardado num Diário oculto ("Baú do Grupo"), e não mais numa configuração de mundo. Jogadores gravam direto, sem precisar de um Mestre online.
- Migração automática: na primeira vez que um Mestre entra no mundo com esta versão, o Diário é criado com o conteúdo atual do Baú. A configuração antiga fica como cópia de segurança.
- Cadeado do Mestre no cabeçalho do Baú. Aberto: jogadores movimentam livremente. Trancado: o Diário fica só para leitura, e cada movimentação de jogador pede autorização ao Mestre online, que executa a gravação.
- `module.json` declara `"socket": true`, necessário para o canal do módulo no Foundry V13.
- Não apague o Diário "Baú do Grupo": ele contém o inventário, as moedas e o histórico.

## v1.10.0
- Novo visual "taverna": madeira escura com detalhes em latão, título em fonte de fantasia (Modesto Condensed, já incluída no Foundry).
- Moedas como fichas na cor do metal, com saldo em destaque e botões redondos de depositar/retirar.
- Cadeado verde (aberto) ou vermelho (trancado), com faixa de aviso quando trancado.
- Cartões de item compactos (não esticam mais), nome inteiro em até duas linhas, quantidade em selo sobre a imagem, botões "Retirar" e lixeira.
- Categorias vazias esmaecidas; contagem em selo.
- Histórico com ícone de entrada/saída/descarte, rota, autor, data e valor.
- Depósito e Saque do Mestre movidos para a barra de abas.
- Nenhuma função removida; todos os `data-*` usados pelos eventos foram mantidos.

## v1.10.1
- Corrige o agrupamento ao retirar itens do Baú: a busca na ficha nunca encontrava o item equivalente (efeitos e valores calculados do Item vivo não batiam com os dados guardados), e sempre criava um item novo.
- Nova regra única de agrupamento (`scripts/core/stack-key.mjs`), usada na ficha e no Baú: mesmo tipo + mesmo nome (sem diferenciar maiúsculas e espaços nas pontas) + mesmas melhorias, material e encantos (`system.upgrades`).
- Itens que já estão em pilhas separadas dentro do Baú são unidos quando o Mestre entra no mundo. Duplicatas que já existem nas fichas não são alteradas.

## Instalação pelo Foundry

Em *Configuração > Módulos > Instalar Módulo*, cole no campo **URL do Manifesto**:

```
https://github.com/Acimerick/tormenta20-party-chest/releases/latest/download/module.json
```

## Licença

[MIT](LICENSE) © Acimerick
