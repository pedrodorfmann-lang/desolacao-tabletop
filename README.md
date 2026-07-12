# Desolação Tabletop

Mesa digital para **Ordem Paranormal: Desolação** — o mapa aparece na TV deitada sobre a mesa
(com as miniaturas físicas por cima) e todo o controle fica no notebook do mestre.

- **Janela do Mestre**: biblioteca de mapas/tokens, cenas, névoa de guerra, grid, zoom/pan.
- **Janela do Jogador (TV)**: só o mapa e os tokens. Zero interface, zero cursor.

Tudo funciona 100% offline. Os dados (biblioteca, cenas, configurações e cache de imagens)
ficam em `%APPDATA%\desolacao-table`.

---

## Rodar em desenvolvimento

```bash
npm install
npm run dev
```

## Gerar o instalador (Windows)

```bash
npm run dist
```

O instalador NSIS sai em `release/`. Instale normalmente; o app não precisa de internet.

---

## Primeiro uso

1. Abra o app e clique em **⚙ (Configurações)** no topo direito.
2. Em **Pasta de mapas**, aponte para a sua pasta local `MAPAS` (a cópia local do Drive).
3. Em **Pasta de tokens**, aponte para a sua pasta `TOKENS`.
4. O app importa tudo e começa a gerar miniaturas e versões otimizadas em segundo plano
   (indicador "preparando N imagens" no topo). Os arquivos originais **não são alterados**.
5. As pastas são monitoradas: basta salvar uma imagem nova nelas que ela aparece na biblioteca.
   Também dá para arrastar arquivos de imagem direto para os painéis MAPAS/TOKENS.

> **OneDrive:** se as pastas estiverem no OneDrive, marque-as como
> "Manter sempre neste dispositivo" para evitar travadas na primeira leitura.

### Logo da campanha

Coloque um arquivo de imagem (jpg/png/webp) em `assets/logo/` na pasta do projeto/instalação.
Ele aparece no cabeçalho da janela do mestre e na tela de blackout/splash da TV
(Configurações → Tela de blackout → "Splash com logo").

---

## Configurando as duas telas

1. No Windows, configure a TV como **segundo monitor** no modo **Estender** (Win+P → Estender).
2. No app: menu **Janela do Jogador → Exibir no display** e escolha o display da TV
   (ou em ⚙ → "Display da janela do jogador"). A escolha fica salva.
3. Clique em **Abrir TV** no cabeçalho. A janela abre em tela cheia, sem bordas, no display escolhido.
4. Com um único monitor (para preparar a sessão em casa), a janela do jogador abre em modo
   janela normal — útil para pré-visualizar.

---

## Fluxo de jogo (resumo)

- **Trocar de mapa**: 1 clique na miniatura (aba MAPAS). A TV faz um fade para preto
  (configurável, padrão 400 ms) e só mostra o mapa novo quando ele está totalmente carregado.
- **Variantes Dia/Noite**: mapas cujos nomes diferem só por DIA/NOITE são pareados
  automaticamente (badge ⇄). O botão amarelo **⇄** na barra de ferramentas alterna entre eles
  mantendo tokens, câmera e névoa.
- **Tokens**: arraste da aba TOKENS para o mapa. Arraste para mover; `Ctrl+roda` redimensiona;
  `Alt+roda` gira; painel à direita para nome, rótulo na TV, frente/trás, duplicar, excluir.
- **Token oculto (emboscada)**: `H` ou o checkbox "Oculto" — você vê o token a 50% com badge
  vermelho OCULTO; os jogadores não veem nada. Um clique revela.
- **Névoa de guerra**: pincéis e retângulos de ocultar/revelar. Você vê as áreas escondidas
  escurecidas; os jogadores veem preto absoluto. Persistente por cena, com desfazer.
- **Grid**: `G` liga/desliga. Em "opções" ajuste célula/cor/opacidade, ou use **Calibrar**:
  arraste um retângulo sobre 1 quadrado do mapa e o tamanho é derivado sozinho.
  "Encaixar tokens no grid" ativa o snap.
- **Cenas**: aba CENAS → "+ Nova cena" congela o estado atual (mapa + tokens + câmera + névoa).
  Troque de cena com 1 clique ou `PgUp/PgDn`. Tudo é salvo automaticamente e restaurado
  ao reabrir o app.
- **Blackout**: tecla `B` ou o botão vermelho — a TV fica preta (ou mostra a splash com a logo)
  na hora. Aperte de novo para restaurar.
- **Ping**: `Alt+clique` em qualquer lugar do mapa — um círculo amarelo pulsa na TV.
- **Desenho livre**: ferramenta ✎ para setas/círculos rápidos; "limpar" apaga tudo.
- **HUD**: botão HUD na barra — mostra uma imagem escolhida (tracker de turno, handout)
  num canto da TV.

## Atalhos

| Tecla | Ação |
| --- | --- |
| `Ctrl+K` | Buscar mapas |
| `B` | Blackout |
| `G` | Grid |
| `F` | Ajustar mapa à TV |
| `H` | Ocultar/revelar token selecionado |
| `Del` | Excluir token |
| `Ctrl+D` | Duplicar token |
| `PgUp/PgDn` | Cena anterior/próxima |
| `+`/`−` | Zoom |
| `Esc` | Desselecionar / ferramenta padrão |
| `Alt+clique` | Ping |
| Roda | Zoom no cursor |
| Botão do meio | Pan |

Lista completa em **? (Ajuda)** no app.

---

## Notas técnicas

- Electron + React + TypeScript; renderização WebGL (PixiJS 8) nas duas janelas.
- Estado único (Zustand) na janela do mestre, replicado para a TV via IPC — a janela do
  jogador é um renderizador puro.
- No import, cada imagem gera uma miniatura (~300 px) e uma versão de exibição WebP
  (até 8192 px no lado maior, configurável) no cache local. O original permanece intocado.
- Alvo de performance: pan/zoom a 60 fps com mapas de 70 MB e 30+ tokens.
