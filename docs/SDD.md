# SDD do Baixar YouTube (Electron para Windows)

| Item | Valor |
|---|---|
| Versão do documento | 1.0 (aprovado em 24/10/2026, com as recomendações das decisões; implementado) |
| Versão do aplicativo | 1.0.0-beta.1 (versão para testes) |
| Data | 24/10/2026 |
| Autor | weliveiracruz |
| Base funcional | YouTubeDownloaderNVDA 1.1.0 (github.com/weliveiracruz/YouTubeDownloaderNVDA, commit 22e8066) |
| Plataforma | Windows 10 22H2 e Windows 11, 64 bits |
| Tecnologia | Electron 44.7.0 + TypeScript 6.0, esbuild, sem framework de interface (HTML semântico) |
| Idiomas | pt-BR (padrão) e en |
| Pasta do projeto | C:\git\BaixarYoutube |
| Status | **Implementado** (1.0.0-beta.1). Testes manuais com leitores de tela: docs/TESTES-MANUAIS.md |

## 1. Objetivo

Levar as mesmas funções do complemento YouTubeDownloaderNVDA para um aplicativo de Windows independente, que não depende do NVDA: baixar vídeos e playlists do YouTube e do YouTube Music (ou só o áudio) numa janela simples, **completamente acessível** a qualquer pessoa — usuária de leitor de tela (NVDA, JAWS, Narrador), de teclado, de lupa e alto contraste, ou de mouse — e com a identidade visual do design system do Nubank (cores, tokens, tipografia, componentes).

Fora do escopo (igual ao complemento): canais inteiros, buscas, legendas, agendamento, histórico de downloads, outros sites, contas do Google, cookies, contorno de DRM. Fora do escopo desta versão: macOS e Linux, atualização automática do aplicativo, assinatura de código (ver D-07).

## 2. Paridade com o complemento

Cada requisito do complemento tem um equivalente aqui. O que muda é só o que dependia do NVDA.

| Complemento (RF) | Aplicativo | Mudança |
|---|---|---|
| RF-01 NVDA+Y abre a janela | RF-01 | Atalho global configurável (padrão **Ctrl+Alt+Y**) e ícone na área de notificação; instância única |
| RF-02 colar da área de transferência | RF-02 | Igual |
| RF-03 pasta Downloads + Escolher pasta | RF-03 | `dialog.showOpenDialog` em vez de wx.DirDialog |
| RF-04 cinco formatos | RF-04 | Igual |
| RF-05 Baixar valida | RF-05 | Igual |
| RF-06 progresso e anúncios | RF-06 | `ui.message` vira região viva ARIA (seção 4.3) |
| RF-07 a RF-10 | RF-07 a RF-10 | Igual |
| RF-11 fechar durante download | RF-11 | "Continuar em segundo plano" esconde na área de notificação |
| RF-12 Configurações do NVDA | RF-12 | Tela Configurações do próprio aplicativo |
| RF-13 binários embutidos | RF-13 | Igual (extraResources do instalador) |
| RF-14 fechar o NVDA cancela | RF-14 | Sair do aplicativo ou desligar o Windows cancela |
| RF-15 a RF-20 playlists | RF-15 a RF-20 | Igual |
| — | RF-21 a RF-26 | Novos: tema, notificação do Windows, manual, menu da área de notificação, miniatura do vídeo, animações |

O núcleo do complemento (`core/urls.py`, `formats.py`, `progress.py`, `filenames.py`, `errors.py`, `folders.py`, `binaries.py`, `engine.py`) é portado para TypeScript **linha a linha, com os mesmos casos de teste**, porque é ele que já foi validado com o yt-dlp real (303 testes + MAN-01 a MAN-35).

## 3. Requisitos

### 3.1 Requisitos funcionais (RF)

| ID | Requisito |
|---|---|
| RF-01 | O aplicativo abre a janela "Baixar do YouTube". Só existe uma instância (`app.requestSingleInstanceLock`): abrir de novo, usar o atalho global ou clicar no ícone da área de notificação traz a janela existente para a frente com o foco no campo URL. |
| RF-02 | Campo "URL do vídeo ou da playlist" (máx. 2048 caracteres). Ao abrir ou trazer a janela para a frente sem download em andamento, se a área de transferência tiver um link válido do YouTube, ele é colado na forma canônica e fica selecionado. |
| RF-03 | Campo somente leitura "Pasta de download" + botão "Escolher pasta…". Padrão: pasta Downloads do Windows (`app.getPath('downloads')`). Pasta que deixou de existir volta para Downloads. |
| RF-04 | Lista "Formato": Vídeo MP4 (melhor qualidade), Vídeo MP4 720p, Vídeo MP4 360p (arquivo menor), Áudio MP3, Áudio M4A. |
| RF-05 | Botão "Baixar" (Enter em qualquer campo do formulário): valida a URL e se a pasta pode ser gravada; em erro, mostra a mensagem junto ao campo, anuncia e põe o foco no controle a corrigir. |
| RF-06 | Durante o download: barra de progresso única para vídeo + áudio, campo Situação ("Baixando: 45%, 12,0 MB de 27,0 MB, faltam 20 s") e anúncio a cada 10% (configurável: 10%, 25% ou desligado). "Baixar" vira "Cancelar"; URL, pasta e formato ficam desabilitados. |
| RF-07 | Ao terminar: anúncio "Download concluído: <título>", barra em 100%, botões "Abrir arquivo" e "Abrir pasta" habilitados. Em erro: mensagem da seção 6.3. |
| RF-08 | Cancelar encerra o yt-dlp e o ffmpeg (árvore de processos, `taskkill /T /F`) e apaga os arquivos parciais. |
| RF-09 | Última pasta e último formato são lembrados entre sessões. |
| RF-10 | O título é lido antes de baixar (`yt-dlp -J`), anunciado e usado como nome do arquivo, sem caracteres inválidos nem nomes reservados do Windows. Nunca sobrescreve: "<título> (2).mp4". |
| RF-11 | Esc, botão Fechar ou Alt+F4 fecham a janela. Durante um download, pergunta: "Continuar em segundo plano" (esconde a janela na área de notificação; o fim é avisado por notificação do Windows), "Cancelar o download" (cancela e fecha) ou "Voltar". Sem download, fechar encerra o aplicativo (ver D-05). |
| RF-12 | Tela "Configurações": pasta padrão, frequência dos anúncios, tema (Sistema / Claro / Escuro), atalho global (ligado/desligado + combinação), idioma, versão do yt-dlp (lida em segundo plano) e botão "Atualizar o mecanismo de download" (`yt-dlp -U` numa cópia em `%APPDATA%\BaixarYoutube\bin`). |
| RF-13 | yt-dlp e FFmpeg vêm dentro do instalador: nada mais precisa ser instalado. |
| RF-14 | Sair do aplicativo (menu da área de notificação ou desligamento do Windows) durante um download cancela e apaga os parciais. |
| RF-15 | Aceita links de playlist do YouTube e do YouTube Music (`playlist?list=…`, álbuns `OLAK5uy_…`, mixes `RD…`). |
| RF-16 | Link de vídeo dentro de playlist (`watch?v=…&list=…`): pergunta "Só este vídeo", "A playlist inteira" ou "Voltar". Shorts, live e embed são sempre um vídeo só. |
| RF-17 | Antes de baixar uma playlist, lê a lista (`--flat-playlist -J`) e pede confirmação com título, número de vídeos e pasta. "Não" não baixa nada. |
| RF-18 | A playlist vai para uma pasta nova com o nome dela (sem sobrescrever: "(2)"), arquivos "001 - <título>.<ext>". |
| RF-19 | Anuncia cada item ("3 de 20: <título>", exceto com anúncios desligados); a barra mostra a playlist inteira; o fim diz quantos foram baixados e quantos não puderam ser. |
| RF-20 | Cancelar uma playlist mantém os concluídos e apaga só o incompleto; Abrir pasta abre a pasta da playlist; sem nenhum concluído, a pasta vazia é removida. |
| RF-21 | (novo) Tema claro e escuro do design system, seguindo o Windows por padrão, e respeito total ao Alto Contraste do Windows (seção 5.6). |
| RF-22 | (novo) Com a janela escondida ou sem foco, o fim do download (ou o erro) gera uma notificação do Windows; clicar nela traz a janela de volta. Notificações nunca são a única forma de saber o resultado: a Situação também mostra. |
| RF-23 | (novo) F1 abre o manual (HTML local, acessível, no idioma da interface) numa janela própria. |
| RF-24 | (novo) Menu da área de notificação: "Abrir Baixar YouTube", "Cancelar o download" (só durante um), "Sair". |
| RF-25 | (novo, v0.2) **Miniatura do que vai ser baixado.** Assim que o campo URL tem um link válido (colado, digitado ou vindo da área de transferência), aparece o cartão de mídia (seção 5.5) com a miniatura do vídeo, buscada pelo id em `i.ytimg.com` (`maxresdefault.jpg`, e `hqdefault.jpg` se não existir), sem esperar o Baixar. Em paralelo, 600 ms depois que a URL para de mudar, roda a leitura antecipada (`-J`, seção 4.2) e o cartão ganha o título, o canal e a duração; é anunciado uma vez por link, na região `status`: "Vídeo: <título>, 3 min 20 s" ou "Playlist: <título>, 20 vídeos". Se a URL mudar, a leitura em andamento é cancelada. Formatos de áudio mostram a mesma imagem com recorte quadrado (capa) e o selo "Áudio MP3"/"Áudio M4A"; vídeo mostra 16:9 com o selo "Vídeo MP4 720p" etc. (o selo muda junto com o Formato). Playlist: miniatura do primeiro item, selo "Playlist · 20 vídeos" e, durante o download, a miniatura troca para a do item atual. Sem imagem (rede, vídeo privado) fica um espaço reservado com ícone e o texto "Sem miniatura"; a falta da imagem nunca impede o download. Mudar ou apagar a URL troca ou remove o cartão. |
| RF-26 | (novo, v0.2) **Animações** com os tokens de movimento do design system (seção 5.7): entrada do cartão de mídia, carregamento da miniatura, progresso suave, troca Baixar ↔ Cancelar, conclusão e erro. Configuração "Animações": Seguir o Windows (padrão) / Ligadas / Desligadas. Com "Seguir o Windows" e a opção "Mostrar animações no Windows" desligada (`prefers-reduced-motion: reduce`), nada se move. |

### 3.2 Requisitos de acessibilidade (RA)

Meta: **WCAG 2.2 nível AA completo**, e AAA onde não custa nada (contraste de texto 7:1 no tema claro, alvos de 44 px). Testado com NVDA, JAWS e Narrador.

| ID | Requisito |
|---|---|
| RA-01 | HTML semântico nativo: `<form>`, `<label for>`, `<input>`, `<select>`, `<button>`, `<progress>`, `<dialog>`. Nada de `div` clicável. ARIA só onde o HTML não basta (região viva, `aria-describedby`, `aria-invalid`). Todo controle tem nome acessível, conferido pela árvore de acessibilidade do Chromium (UIA/MSAA). |
| RA-02 | Ordem de Tab (igual ao complemento): URL → Pasta de download → Escolher pasta → Formato → Baixar/Cancelar → Situação → Abrir arquivo → Abrir pasta → Configurações → Fechar. A ordem visual é a mesma do DOM; nenhum `tabindex` positivo. Botões desabilitados usam `disabled` (saem do Tab). Campos somente leitura usam `readonly` (continuam no Tab e são lidos). |
| RA-03 | Teclas de acesso únicas por tela, com a letra sublinhada no rótulo (como no Windows). pt-BR: Alt+U URL, Alt+D pasta, Alt+E Escolher pasta, Alt+F Formato, Alt+B Baixar / Alt+C Cancelar, Alt+S Situação, Alt+A Abrir arquivo, Alt+P Abrir pasta, Alt+G Configurações, Alt+H Fechar. en: Alt+U URL, R folder, B Browse, O Format, D Download / C Cancel, S Status, F Open file, L Open folder, T Settings, E Close. Implementadas por um tratador de teclado próprio (não `accesskey`), sem barra de menu para não roubar o Alt. |
| RA-04 | Anúncios por duas regiões vivas fora da tela: `role="status"` (`aria-live="polite"`) para progresso e marcos, `role="alert"` (`assertive`) só para erros. Nunca move o foco para anunciar. Mesmo texto não é repetido (o marco 40% sai uma vez); o texto da região é trocado, não acumulado. O campo Situação mostra o texto completo e **não** é região viva (evita leitura dupla). |
| RA-05 | Barra `<progress>` com rótulo visível "Progresso", `aria-valuetext` com "45%" e fora do Tab (como no complemento). |
| RA-06 | Erros de validação: mensagem visível abaixo do campo, ligada por `aria-describedby`, `aria-invalid="true"`, ícone + texto (não só cor), foco no campo, anúncio na região `alert`. O erro some quando o campo muda. |
| RA-07 | Diálogos (playlist, confirmação, fechar durante download) com `<dialog>.showModal()`: foco no primeiro botão (ou no padrão), Tab preso no diálogo, Esc = "Voltar", título ligado por `aria-labelledby` e pergunta por `aria-describedby`, foco devolvido ao controle de origem ao fechar. |
| RA-08 | Foco sempre visível: anel de 3 px na cor `focus-ring` com 2 px de afastamento, contraste ≥ 3:1 com os dois fundos (WCAG 2.4.7, 2.4.11, 2.4.13). Nunca `outline: none` sem substituto. Foco nunca encoberto por outro elemento (2.4.11). |
| RA-09 | Contraste: texto ≥ 4,5:1 (meta 7:1 no claro), texto grande e componentes ≥ 3:1, nos dois temas — conferido por teste automático sobre os tokens (seção 5.2). Nenhuma informação só por cor, som ou animação. |
| RA-10 | Alto Contraste do Windows: `@media (forced-colors: active)` usa as cores do sistema (`Canvas`, `CanvasText`, `ButtonText`, `Highlight`, `GrayText`), bordas visíveis em todos os controles e na barra, foco com `Highlight`. |
| RA-11 | Zoom e texto: Ctrl+= / Ctrl+- / Ctrl+0 (50% a 300%), layout que reflui sem rolagem horizontal até 400% de 320 px CSS (1.4.10), espaçamento de texto ajustável sem cortar (1.4.12). Respeita a escala de texto do Windows. |
| RA-12 | Movimento (WCAG 2.3.3, 2.2.2, 2.3.1): `prefers-reduced-motion: reduce` ou "Animações: Desligadas" troca todo movimento por mudança instantânea (só um esmaecimento de até 150 ms é mantido, porque não desloca nada). Nenhuma animação passa de 320 ms, exceto o brilho de carregamento da miniatura, que para sozinho em 5 s; nada pisca mais de 3 vezes por segundo; nenhuma animação move o foco, atrasa o foco ou esconde um controle enquanto ele tem o foco. Animações nunca são a única forma de saber de algo: todo estado também está em texto. |
| RA-18 | (v0.2) Miniatura: é imagem decorativa (`alt=""`), porque o título, o canal, a duração e o formato estão escritos ao lado em texto e já são anunciados; assim o leitor de tela não lê a mesma coisa duas vezes. O cartão é um `<figure>` com `<figcaption>` (título, canal · duração, selo do formato), fora do Tab (não é interativo) e alcançável pela navegação de leitura. A troca da miniatura não vai para a região viva. O espaço reservado tem o texto visível "Sem miniatura". Sem texto dentro de imagem; o selo é texto HTML com contraste ≥ 4,5:1 sobre a imagem (fundo sólido, não transparente). |
| RA-13 | Alvos de clique ≥ 44×44 px (2.5.8 pede 24; usamos o token `min-target` 44). |
| RA-14 | Idioma: `<html lang="pt-BR">` (ou `en`), título da janela "Baixar do YouTube", títulos de seção com `<h1>`/`<h2>` para navegação por cabeçalhos do leitor de tela. |
| RA-15 | Sem limite de tempo; nada acontece só por receber foco (3.2.1); mudar o Formato não dispara nada. |
| RA-16 | Atalho global configurável e desligável (2.1.4) e sem conflito com os atalhos do NVDA, JAWS e Narrador; conferido contra a lista de comandos de cada um (T-ACC-12). |
| RA-17 | Ícone e notificação do Windows com texto (nome do aplicativo + estado); menu da área de notificação navegável por teclado (menu nativo do Electron, acessível por UIA). |

### 3.3 Requisitos de segurança (RS)

Os seis requisitos do complemento continuam (RS-01 a RS-06, adaptados), mais o checklist de segurança do Electron.

| ID | Requisito |
|---|---|
| RS-01 | Validação de link idêntica ao complemento: só http/https de youtube.com, www/m/music.youtube.com e youtu.be, sem usuário/senha, portas 80/443, vídeo (id de 11) ou playlist (id de 12 a 80 de `[A-Za-z0-9_-]`, um só). Reescrito na forma canônica. Feita no processo principal (a do renderer é só para resposta rápida). |
| RS-02 | `child_process.spawn` com lista de argumentos e `shell: false`, `windowsHide: true`; URL sempre depois de `--`; `--ignore-config`; `--no-playlist` para vídeo e `--yes-playlist --windows-filenames` só para playlist escolhida. |
| RS-03 | Binários fixados em `tools/binaries.json` (versão + SHA-256), baixados só por HTTPS dos releases oficiais; o build recusa empacotar se `resources/bin` não bater; o aplicativo confere `files.sha256` antes do primeiro download de cada sessão e não executa nada se houver diferença. |
| RS-04 | Arquivo sempre gravado dentro da pasta escolhida (`isInside`); `%` escapado no modelo do yt-dlp. |
| RS-05 | Nenhuma conta, cookie ou senha; nenhum histórico de links; o link não vai para o log. |
| RS-06 | Electron endurecido: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, sem `webview`, sem `remote`; CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`; navegação e `window.open` bloqueados (`will-navigate`, `setWindowOpenHandler` → deny); permissões negadas (`setPermissionRequestHandler`); nenhuma página remota carregada; protocolo `app://` próprio para os arquivos locais. |
| RS-07 | IPC mínimo e tipado (seção 7): o preload expõe só funções nomeadas via `contextBridge`, nunca `ipcRenderer` cru; o principal valida cada argumento (tipo, tamanho, valores permitidos) e confere `event.senderFrame` contra a URL do aplicativo. |
| RS-08 | "Abrir arquivo" e "Abrir pasta" só abrem caminhos que o próprio aplicativo acabou de gravar (o renderer manda um id do job, nunca um caminho); `shell.openPath` para o arquivo e `shell.showItemInFolder`/`openPath` para a pasta. |
| RS-09 | Electron Fuses: `RunAsNode` desligado no binário final, `EnableNodeCliInspectArguments` desligado, `EnableEmbeddedAsarIntegrityValidation` e `OnlyLoadAppFromAsar` ligados. yt-dlp é chamado direto (é um .exe), sem precisar de RunAsNode. |
| RS-11 | (v0.2) Miniaturas: baixadas **pelo processo principal** com `net.fetch`, só de `https://i.ytimg.com/vi/<id de 11 caracteres validado>/(maxresdefault│hqdefault).jpg` (URL montada pelo aplicativo, nunca a que vem no JSON do yt-dlp), sem cookies (`credentials: 'omit'`, sessão separada sem persistência), sem seguir redirecionamento para outro host, tempo máximo de 10 s, no máximo 2 MB, e só aceitas se os primeiros bytes forem de JPEG/PNG/WebP. Chegam ao renderer como `data:` URL (o CSP já permite `img-src 'self' data:`; o renderer continua sem acesso à rede, `connect-src 'none'`). Ficam só em memória (no máximo 20, descartadas ao fechar); nada vai para o disco nem para o histórico (RS-05). Com "Mostrar miniatura" desligado nenhuma requisição é feita. |
| RS-10 | Dependências mínimas e fixadas (lockfile, `npm ci`), `npm audit` sem alta/crítica, Electron na versão estável mais recente no início da implementação, fixada com versão exata. |

### 3.4 Restrições

- O núcleo (`src/core/`) é TypeScript puro, sem Electron nem DOM, testável em Node.
- Todo processo externo roda no processo principal; o renderer só recebe eventos.
- yt-dlp (Unlicense) e FFmpeg (GPL, build "shared" do yt-dlp/FFmpeg-Builds) são programas separados, chamados por linha de comando, com as licenças no instalador. O aplicativo em si: GPL-2.0, como o complemento (ver D-08).
- Aviso no manual e na primeira execução: baixar só o que se tem direito de baixar, respeitando direitos autorais e os Termos de Serviço do YouTube.
- Marca: usamos a **linguagem visual** do design system do Nubank (cores, tokens, tipografia, formas). O aplicativo **não** usa o nome, o logotipo nem o símbolo do Nubank e não se apresenta como produto do Nubank (ver D-02).

## 4. Arquitetura

```
C:\git\BaixarYoutube\
  package.json, package-lock.json, tsconfig.json, electron-builder.yml
  src/
    core/                 (TypeScript puro; porte do core/ do complemento)
      urls.ts             RS-01: parse, canonical, videoUrl, playlistUrl, findInText
      formats.ts          RF-04: chaves, seletores -f, argumentos, extensão
      progress.ts         modelos --progress-template, parseLine, Tracker, marcos
      filenames.ts        safeName, uniqueBase, outputTemplate, playlistTemplate, isInside, partialFiles
      errors.ts           classify(saída) → código
      folders.ts          pasta padrão e teste de gravação
      binaries.ts         caminhos, verify (SHA-256), version, update
      engine.ts           Job e PlaylistJob (EventEmitter), killTree, limpeza
    main/
      main.ts             ciclo de vida, instância única, janela, CSP, fuses checados
      tray.ts             ícone e menu da área de notificação
      shortcut.ts         atalho global
      ipc.ts              canais validados (seção 7)
      settings.ts         leitura/gravação de settings.json com esquema
      notify.ts           notificações do Windows
      i18n.ts             textos do processo principal
    preload/
      preload.ts          contextBridge.exposeInMainWorld('baixar', {...})
    renderer/
      index.html          janela principal (HTML semântico)
      settings.html       (ou seção da mesma página; ver 6.2)
      app.ts              estado da tela, teclas de acesso, diálogos
      announcer.ts        regiões vivas (RA-04)
      i18n/pt-BR.json, en.json
      styles/
        tokens.css        tokens do design system (seção 5)
        base.css          reset, tipografia, foco, forced-colors, reduced-motion
        components.css    botões, campos, select, barra, cartão, diálogo, alerta
    manual/pt-BR.html, en.html
  resources/
    bin/                  (gerado por tools/fetch-binaries, fora do git)
      yt-dlp.exe, yt-dlp-LICENSE.txt, files.sha256, versions.json
      ffmpeg/ffmpeg.exe, ffprobe.exe, *.dll, LICENSE.txt
    icons/                app.ico, tray.ico (claro/escuro/alto contraste)
  tools/
    binaries.json         mesmas versões e SHA-256 do complemento
    fetch-binaries.ts
    build.ts              testes → verificação de binários → electron-builder
  tests/
    unit/                 Vitest: porte dos testes do núcleo
    fake/fake-ytdlp.ts    yt-dlp falso (compilado num .exe de teste ou chamado via node)
    e2e/                  Playwright _electron: fluxos, teclado, diálogos
    a11y/                 axe-core + árvore de acessibilidade + contraste dos tokens
    security/             fuses, CSP, IPC, webPreferences
  docs/SDD.md, SDD-TESTES.md, TESTES-MANUAIS.md
  reports/
  CLAUDE.md, CHANGELOG.md, readme.md, COPYING.txt
```

### 4.1 Processos

```
┌──────────────────────────── processo principal (Node) ───────────────────────────┐
│ main.ts ─ janela, tray, atalho, settings                                          │
│ ipc.ts ──► core/engine.ts ──spawn──► yt-dlp.exe ──► ffmpeg.exe                   │
│              ▲ eventos (info, progress, stage, item, done, error, cancelled)       │
└──────────────┼────────────────────────────────────────────────────────────────────┘
               │ IPC tipado (contextBridge)
┌──────────────┴──────────── renderer (sandbox, sem Node) ──────────────────────────┐
│ app.ts ─ formulário, estado, diálogos   announcer.ts ─ regiões vivas              │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Fluxo de download (vídeo)

0. (v0.2) URL válida → `baixar.preview(url)`: o principal busca a miniatura (RS-11) e, 600 ms depois da última mudança, roda o `-J` do passo 2 (para playlist, o `--flat-playlist -J` da seção 4.3). O resultado fica guardado só em memória, ligado ao link canônico, e é descartado quando a URL muda.
1. Baixar → renderer valida (rápido) → `baixar.start({url, format, playlist: false})`. Se a leitura antecipada do mesmo link e do mesmo formato já terminou, o passo 2 é pulado (o download começa na hora); se o formato mudou, o `-J` é refeito só para os tamanhos.
2. Principal: `urls.parse` → `folders.isWritable` → `binaries.verify` (uma vez por sessão) → `yt-dlp --ignore-config --no-playlist --color never --encoding utf-8 -J -f <seletor> -- <url>` → título, partes, tamanhos. Evento `info` → "Baixando: <título>".
3. `filenames.uniqueBase` escolhe "<pasta>\<título>"; yt-dlp roda com `--newline --progress --no-simulate --no-mtime --progress-template download:BAIXARYT|D|… --progress-template postprocess:BAIXARYT|P|… --print after_move:BAIXARYT|F|%(filepath)s -o "<base>.%(ext)s" -- <url>` (mais `-S res,fps,vcodec:h264,acodec:aac --merge-output-format mp4 --remux-video mp4` para vídeo; `-x --audio-format mp3 --audio-quality 0` ou `m4a` para áudio).
4. `progress.Tracker` junta as partes numa porcentagem que nunca volta e decide os marcos (10, 20… sem 0 nem 100). Pós-processamento: "Juntando vídeo e áudio…" (Merger) ou "Convertendo o arquivo…" (ExtractAudio/VideoRemuxer), uma vez só (D-06 do complemento).
5. Código 0 e arquivo dentro da pasta → `done`; senão apaga os parciais (10 tentativas a cada 300 ms) e `errors.classify` dá o código.
6. Eventos de progresso para o renderer são limitados a 4 por segundo (a barra não precisa de mais e o leitor de tela não é inundado); marcos e mudanças de estado passam sempre.

### 4.3 Fluxo da playlist

Igual à seção 3.4 do SDD do complemento: `--yes-playlist --flat-playlist -J` → evento `playlistInfo` → o job espera `proceed` ou `cancel` (diálogo RF-17) → cria a subpasta → um só yt-dlp com `-i --windows-filenames --trim-filenames 150 --print before_dl:…|I|%(playlist_index)s|%(title)s --print after_move:…|F|%(filepath)s -o "<subpasta>\%(playlist_index)03d - %(title)s.%(ext)s"` → porcentagem geral ((posição − 1) + fração do item) / total → no fim apaga da subpasta o que não está na lista de concluídos.

### 4.4 Componentes embutidos

| Componente | Versão fixada | Origem | Tamanho |
|---|---|---|---|
| yt-dlp.exe | 2026.10.21 | github.com/yt-dlp/yt-dlp/releases | 17 MB |
| FFmpeg (ffmpeg.exe, ffprobe.exe + DLLs) | N-128018-ga881f0a9ad | github.com/yt-dlp/FFmpeg-Builds (win64-gpl-shared) | 186 MB |
| Electron (Chromium + Node) | estável mais recente, versão exata | npm | ~ 250 MB instalado |

Instalador gerado: ~ 187 MB (NSIS; as DLLs do FFmpeg quase não comprimem); instalado: ~ 450 MB. Versões e SHA-256 reaproveitados de `tools/binaries.json` do complemento; atualizações seguem o mesmo processo.

## 5. Design system (linguagem visual do Nubank)

### 5.1 Fonte dos tokens e ressalvas

O Nubank não publica oficialmente seu design system (NuDS) nem exporta tokens. Os valores abaixo vêm de:

- **Roxo da marca `#820AD1`** (Roxo Nu, o valor amplamente divulgado da identidade de 2021);
- da reconstrução pública "Nubank DESIGN.md" (webdesignhot.com/design.md/nubank) para escalas de tipografia, espaçamento, raios, sombras, movimento e componentes;
- de **ajustes nossos de contraste** onde o valor de referência não passa no WCAG AA (marcados com ✱ e medidos na seção 5.2).

A fonte da marca (**Nu Sans** Display/Text) é proprietária e não pode ser distribuída sem licença. A pilha de fontes começa nela (se estiver instalada na máquina, é usada) e cai para **Segoe UI Variable**, a fonte do Windows 11, que tem métricas próximas e ótima renderização ClearType (ver D-03).

### 5.2 Cores (tokens semânticos)

Contrastes medidos com a fórmula do WCAG 2.2 (teste automático T-A11Y-TOK refaz a conta a cada build).

**Tema claro**

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--color-bg` | `#FFFFFF` | Fundo da janela | — |
| `--color-bg-subtle` | `#F5F2FA` | Fundo da área de status, cartões suaves | — |
| `--color-bg-purple-tint` | `#F3E9FD` | Cartão de sucesso, item selecionado | — |
| `--color-surface` | `#FFFFFF` | Cartões | — |
| `--color-brand` | `#820AD1` | Botão primário, links, barra de progresso, cabeçalho | 7,21:1 no branco (AAA) |
| `--color-brand-hover` | `#6A0AAB` | Hover/pressionado do primário | 9,36:1 |
| `--color-brand-deepest` | `#3D0764` | Faixa do cabeçalho | — |
| `--color-brand-soft` | `rgba(130,10,209,.10)` | Fundo de badge, trilho da barra | — |
| `--color-on-brand` | `#FFFFFF` | Texto sobre roxo | 7,21:1 |
| `--color-text` | `#000000` | Títulos | 21:1 |
| `--color-text-body` | `#1A1A1A` | Texto | 17,4:1 |
| `--color-text-muted` | `#595959` | Textos de apoio, rótulo de progresso | 7,00:1 (AAA) |
| `--color-text-disabled` ✱ | `#6B6B6B` | Botão desabilitado (referência `#8A8A8A` dá 3,45:1) | 5,3:1 |
| `--color-border` | `rgba(0,0,0,.10)` | Bordas decorativas de cartão | decorativa |
| `--color-border-control` ✱ | `#767676` | Borda de campos e select (componente: precisa de 3:1) | 4,54:1 |
| `--color-success` ✱ | `#1F7A35` | Texto/ícone de sucesso (referência `#2DB84F` dá 2,60:1) | 5,39:1 |
| `--color-warning` ✱ | `#8A5A00` | Texto/ícone de aviso (referência `#F5A623` dá 2,03:1) | 5,93:1 |
| `--color-danger` ✱ | `#B3261E` | Erro (referência `#E02D2D` dá 4,58:1, no limite) | 6,54:1 |
| `--color-accent-pink` | `#FF4D8B` | Só decorativo (ilustração), nunca texto | — |
| `--color-accent-yellow` | `#FFD23F` | Só decorativo | — |
| `--focus-ring` ✱ | `#820AD1` sólido | Anel de foco (referência `rgba(141,13,227,.45)` dá < 3:1) | 7,21:1 |

**Tema escuro**

| Token | Valor | Contraste |
|---|---|---|
| `--color-bg` | `#1A0B29` | — |
| `--color-bg-elevated` / `--color-surface` | `#2A1240` | — |
| `--color-surface-strong` | `#3D0764` | — |
| `--color-text` | `#FFFFFF` | 18,69:1 |
| `--color-text-body` | `#ECD9FF` | 14,18:1 |
| `--color-text-muted` | `#B69BD1` | 7,65:1 |
| `--color-brand` (fundo de botão) | `#A32FF0` | branco sobre ele: 4,97:1 |
| `--color-brand-text` ✱ (links, texto roxo) | `#C98CFF` | 7,72:1 (o `#A32FF0` como texto dá só 3,76:1) |
| `--color-success` ✱ | `#5AD17A` | 9,64:1 |
| `--color-warning` ✱ | `#FFC857` | 12,15:1 |
| `--color-danger` ✱ | `#FF8A80` | 8,19:1 |
| `--focus-ring` ✱ | `#C98CFF` | 7,72:1 |
| `--color-border-control` | `rgba(255,255,255,.45)` | ≥ 3:1 |

**Alto Contraste do Windows**: todos os tokens acima são substituídos por cores do sistema (`Canvas`, `CanvasText`, `LinkText`, `ButtonFace`, `ButtonText`, `Highlight`, `HighlightText`, `GrayText`) em `@media (forced-colors: active)`.

### 5.3 Tipografia

Pilhas: `--font-display: "Nu Sans Display", "nuSansDisplay", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;` e `--font-text: "Nu Sans Text", "nuSansText", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;`. Tamanhos em `rem` (respeitam zoom e escala do Windows).

| Token | Tamanho / peso / altura de linha | Uso no aplicativo |
|---|---|---|
| `h1` | 32 px / 600 / 1,15 / −0,4 px | "Baixar do YouTube" |
| `h2` | 24 px / 600 / 1,25 | Título dos diálogos e de Configurações |
| `h4` | 20 px / 600 / 1,30 | Título do vídeo em download |
| `title-sm` | 18 px / 600 / 1,35 | Títulos de seção |
| `body` | 16 px / 400 / 1,55 | Texto, campos |
| `body-strong` | 16 px / 600 / 1,55 | Rótulos de campo |
| `body-sm` | 14 px / 400 / 1,50 | Ajuda dos campos, rodapé |
| `label` | 13 px / 500 / 1,40 | Rótulo "Progresso", badges |
| `button` | 16 px / 600 / 1,20 | Botões |

Nenhum texto abaixo de 13 px; nenhum texto em imagem.

### 5.4 Espaçamento, raios, sombras, movimento

| Grupo | Tokens |
|---|---|
| Espaço (base 4) | `xxs 4`, `xs 8`, `sm 12`, `base 16`, `md 24`, `lg 32`, `xl 48`, `xxl 64` |
| Raio | `sm 4`, `md 8` (campos), `lg 12` (cartões), `xl 16` (cartão roxo, diálogo), `pill 9999` (botões) |
| Sombra | `ambient 0 1px 2px rgba(17,0,33,.06)`, `soft 0 4px 12px rgba(17,0,33,.10)`, `standard 0 8px 24px rgba(17,0,33,.14)` (diálogo), `elevated 0 24px 48px -8px rgba(17,0,33,.20)` |
| Movimento | `fast 150ms`, `standard 240ms`, `slow 320ms`; curvas `standard cubic-bezier(.4,0,.2,1)`, `entrance cubic-bezier(0,0,.2,1)`. Zero com `prefers-reduced-motion` |
| Acessibilidade | `min-target 44px`, `focus-ring-width 3px`, `focus-ring-offset 2px` |

### 5.5 Componentes

| Componente | Especificação |
|---|---|
| Botão primário | Fundo `brand`, texto `on-brand`, altura 52 px, padding 16/32, raio pill, fonte `button`. Hover/pressionado `brand-hover`. Desabilitado: fundo `bg-subtle`, texto `text-disabled`, borda tracejada (não só cor). Usado em Baixar/Cancelar |
| Botão secundário (ghost) | Transparente, texto `brand` (escuro: `brand-text`), borda 1 px `brand`, altura 52, pill. Abrir arquivo, Abrir pasta, Escolher pasta |
| Botão de texto | Transparente, texto `brand`, sublinhado no hover e foco. Configurações, Fechar |
| Cancelar (perigo) | Mesmo formato do primário com fundo `danger` e ícone ✕ + texto "Cancelar" |
| Campo de texto | Fundo `bg`, borda 1 px `border-control`, raio 8, altura 52, padding 14/16. Foco: borda 2 px `brand` + anel. Erro: borda `danger` 2 px, ícone ⚠ e mensagem abaixo. Somente leitura: fundo `bg-subtle` |
| Select (Formato) | `<select>` nativo estilizado como o campo (seta própria em SVG `currentColor`); a lista aberta é a nativa do Windows (acessível) |
| Barra de progresso | `<progress>` com trilho `brand-soft`, preenchimento `brand`, altura 8 px, raio pill, borda 1 px em forced-colors; rótulo "Progresso" e porcentagem em texto ao lado |
| Cartão de status | `card-soft` (fundo `bg-purple-tint`, raio 12, padding 24) com a Situação; em sucesso borda esquerda 4 px `success` + ícone ✓; em erro `danger` + ⚠ |
| Cabeçalho | Faixa `brand` (escuro: `surface-strong`) com o `h1` em `on-brand` e um ícone próprio de download (não o logo do Nubank) |
| Diálogo | `<dialog>` com fundo `surface`, raio 16, sombra `standard`, fundo de trás `rgba(17,0,33,.5)`, botões empilhados no estreito |
| Cartão de mídia (v0.2) | `<figure>` com fundo `surface`, borda 1 px `border`, raio 16, sombra `soft`, padding 16. À esquerda a miniatura (raio 12, `object-fit: cover`): 16:9 com 160 × 90 px para vídeo e playlist, 1:1 com 96 × 96 px para áudio. À direita o `<figcaption>`: título em `h4` (até 2 linhas, o resto com reticências e o texto inteiro em `title`), "canal · 3 min 20 s" em `body-sm`/`text-muted` e o selo do formato (`badge-pill`: fundo `brand-soft` sólido equivalente `#F0E6FA` no claro / `#3D0764` no escuro, texto `brand`/`brand-text`, fonte `label`). Durante o download, uma faixa de 4 px na base da miniatura repete o progresso (decorativa, `aria-hidden`). Em telas estreitas (< 480 px) a miniatura vai para cima, com largura total. Espaço reservado: fundo `bg-subtle`, ícone de vídeo/nota musical em `text-muted` e "Sem miniatura" |
| Esqueleto (v0.2) | Enquanto a miniatura e o título carregam: retângulos `bg-subtle` no lugar da imagem e de duas linhas de texto, com o brilho da seção 5.7 |

### 5.6 Esboço da janela (≈ 640 × 720, mínimo 360 × 480, redimensionável)

```
┌──────────────────────────────────────────────────────────┐
│ ▓▓ [↓]  Baixar do YouTube                         ▓▓▓▓▓▓ │  cabeçalho roxo (h1)
├──────────────────────────────────────────────────────────┤
│ URL do vídeo ou da playlist                              │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ https://www.youtube.com/watch?v=…                    │ │
│ └──────────────────────────────────────────────────────┘ │
│ Cole o link de um vídeo ou de uma playlist.              │  ajuda / erro
│                                                          │
│ Pasta de download                                        │
│ ┌────────────────────────────────────┐ ( Escolher pasta…)│
│ │ C:\Users\…\Downloads               │                   │
│ └────────────────────────────────────┘                   │
│ Formato                                                  │
│ ┌──────────────────────────────────────────────────┬─▾─┐ │
│ │ Vídeo MP4 (melhor qualidade)                     │   │ │
│ └──────────────────────────────────────────────────┴───┘ │
│                                                          │
│ ╭──────────────────────────────────────────────────────╮ │
│ │ ┌────────────┐  Me at the zoo                        │ │  cartão de mídia
│ │ │ miniatura  │  jawed · 19 s                         │ │  (RF-25)
│ │ │   16:9     │  ( Vídeo MP4 (melhor qualidade) )     │ │  selo do formato
│ │ └▀▀▀▀▀▀──────┘                                       │ │  faixa de progresso
│ ╰──────────────────────────────────────────────────────╯ │
│                                                          │
│ (██████████████  Baixar  ██████████████)                 │  primário, pill
│                                                          │
│ ╭─ Situação ─────────────────────────────────────────╮   │
│ │ Baixando: 45%, 12,0 MB de 27,0 MB, faltam 20 s     │   │  cartão suave
│ │ Progresso  ▕██████████░░░░░░░░░░▏ 45%              │   │
│ ╰────────────────────────────────────────────────────╯   │
│ ( Abrir arquivo )  ( Abrir pasta )                       │  ghost
│                                                          │
│ Configurações                                  Fechar    │  botões de texto
└──────────────────────────────────────────────────────────┘
```

### 5.7 Animações (v0.2, RF-26)

Só se animam `opacity` e `transform` (sem mexer no layout, sem saltos de conteúdo: o espaço do cartão de mídia é reservado assim que a URL é válida). Implementação em CSS (`transition`/`@keyframes`) com as variáveis `--motion-fast`, `--motion-standard`, `--motion-slow`, `--ease-standard`, `--ease-entrance`; todas viram `0ms` quando `html[data-motion="off"]` (definido pela configuração e por `prefers-reduced-motion`).

| # | Momento | Animação | Duração / curva | Com movimento reduzido |
|---|---|---|---|---|
| A-01 | URL fica válida | Cartão de mídia entra: opacidade 0 → 1 e sobe 8 px → 0 | `standard` 240 ms, `entrance` | Aparece direto |
| A-02 | Miniatura carregando | Esqueleto com brilho diagonal (gradiente `bg-subtle` → `bg-purple-tint`) a cada 1,2 s; para em 5 s e fica estático (2.2.2) | 1,2 s por ciclo, máx. 5 s | Esqueleto estático |
| A-03 | Miniatura chegou | Esmaece do esqueleto para a imagem | `fast` 150 ms | Esmaecimento mantido (sem movimento) |
| A-04 | Formato muda | Selo troca o texto; a miniatura muda o recorte 16:9 ↔ 1:1 com `transform: scale` | `standard` 240 ms | Troca direta |
| A-05 | Download avança | Barra e faixa da miniatura crescem suavemente até o novo valor (`transform: scaleX`), nunca voltam | `standard` 240 ms, `standard` | Pulo direto para o valor |
| A-06 | Baixar ↔ Cancelar | Fundo do botão passa de `brand` para `danger` e o ícone ↓ gira para ✕; o botão **não** muda de lugar nem de tamanho e o foco fica nele | `fast` 150 ms | Troca direta |
| A-07 | Pós-processamento ("Juntando vídeo e áudio…") | Barra em 100% com faixa listrada deslizando (indica trabalho em andamento); para em 5 s e continua só o texto | 1 s por ciclo, máx. 5 s | Estática |
| A-08 | Concluído | Ícone ✓ desenhado (traço SVG `stroke-dashoffset`) e leve pulso do cartão (escala 1 → 1,02 → 1), borda vira `success` | `slow` 320 ms, uma vez | ✓ e borda aparecem direto |
| A-09 | Erro | Ícone ⚠ aparece com esmaecimento; **sem tremor** (balançar é gatilho vestibular e não ajuda) | `fast` 150 ms | Direto |
| A-10 | Item da playlist muda | Miniatura do item novo entra por esmaecimento cruzado | `standard` 240 ms | Troca direta |
| A-11 | Diálogos | Fundo escurece e o diálogo entra com escala 0,96 → 1 e opacidade; o foco vai para o botão já no início (não espera a animação) | `standard` 240 ms | Aparece direto |
| A-12 | Hover/pressionado de botões | Cor de fundo e sombra `ambient` → `soft` | `fast` 150 ms | Só a cor muda |

Nenhuma animação em loop infinito, nenhum parallax, nenhum vídeo ou GIF automático; a miniatura é estática (não é a prévia animada do YouTube).

## 6. Interface

### 6.1 Janela principal

| Controle | Elemento | Tecla (pt-BR) | Observação |
|---|---|---|---|
| URL do vídeo ou da playlist | `<input type="url" maxlength="2048" autocomplete="off" spellcheck="false">` | Alt+U | `aria-describedby` → ajuda/erro |
| Pasta de download | `<input readonly>` | Alt+D | Caminho atual |
| Escolher pasta… | `<button>` | Alt+E | Diálogo nativo do Windows |
| Formato | `<select>` | Alt+F | 5 opções |
| Cartão de mídia | `<figure>` + `<img alt="">` + `<figcaption>` | — | Fora do Tab; visível com URL válida (RF-25, RA-18) |
| Baixar / Cancelar | `<button type="submit">` | Alt+B / Alt+C | Enter no formulário |
| Situação | `<textarea readonly rows="3">` | Alt+S | Texto completo do estado |
| Progresso | `<progress max="100">` + `<label>` | — | Fora do Tab |
| Abrir arquivo / Abrir pasta | `<button>` | Alt+A / Alt+P | Habilitados após concluir; playlist: só Abrir pasta |
| Configurações | `<button>` | Alt+G | Abre a tela 6.2 |
| Fechar | `<button>` | Alt+H / Esc | RF-11 |

Teclas gerais: F1 manual, Ctrl+= / Ctrl+- / Ctrl+0 zoom, Ctrl+L foco na URL. Atalho global: Ctrl+Alt+Y.

### 6.2 Configurações

Tela dentro da mesma janela (troca de seção com `<h2>`, foco no título e botão "Voltar"), para o leitor de tela não perder a janela. Controles: Pasta de download padrão (somente leitura) + Escolher pasta…; Anunciar o progresso (A cada 10% / A cada 25% / Desligado) como grupo de `<input type="radio">` em `<fieldset><legend>`; Tema (Sistema / Claro / Escuro); Animações (Seguir o Windows / Ligadas / Desligadas); Mostrar miniatura do vídeo (ligado por padrão; desligado, nenhuma imagem é buscada); Idioma (Português (Brasil) / English); Atalho global (caixa de seleção + campo que grava a combinação, com "Restaurar padrão"); Iniciar com o Windows na área de notificação (desligado por padrão); Versão do mecanismo de download (yt-dlp) (somente leitura, lida em segundo plano); Atualizar o mecanismo de download (anuncia "Atualizando…" e o resultado). Gravação imediata a cada mudança, anunciada como "Salvo".

### 6.3 Mensagens (pt-BR)

Todas as mensagens do complemento são mantidas, trocando "nas configurações do NVDA, Baixar do YouTube" por "em Configurações". en: textos originais do complemento.

| Código / momento | Mensagem |
|---|---|
| Início | "Cole o link de um vídeo ou de uma playlist e pressione Baixar." |
| URL vazia | "Cole um link do YouTube no campo URL." |
| Outro site | "Este não é um link do YouTube. Cole um link de youtube.com ou youtu.be." |
| Não é vídeo nem playlist | "Este link do YouTube não é de um vídeo nem de uma playlist. Abra o vídeo ou a playlist e copie o link." |
| Lendo | "Obtendo as informações do vídeo…" / "Lendo a playlist…" |
| Baixando | "Baixando: <título>" e "Baixando: 45%, 12,0 MB de 27,0 MB, faltam 20 s" |
| Pós-processo | "Juntando vídeo e áudio…" / "Convertendo o arquivo…" |
| Concluído | "Download concluído: <título>. Salvo em <pasta>" |
| Playlist | "<n> de <total>: <título>"; "Playlist concluída: <n> arquivos salvos em <pasta>"; "Playlist concluída: <n> de <total> baixados em <pasta>. <m> não puderam ser baixados (privados, removidos ou bloqueados)." |
| Cancelado | "Download cancelado." / "Download cancelado. Os <n> arquivos já baixados continuam em <pasta>" |
| permission | "Não é possível gravar na pasta escolhida. Escolha outra pasta." |
| network | "Sem conexão com a internet, ou o YouTube não respondeu. Confira a conexão e tente de novo." |
| unavailable | "Este vídeo não está disponível para download: foi removido, está bloqueado no seu país ou o link está errado." |
| private / age / members / live | "Este vídeo é privado…" / "…tem restrição de idade…" / "…só para membros do canal…" / "Transmissões ao vivo não podem ser baixadas enquanto estão ao vivo…" |
| blocked | "O YouTube pediu para confirmar que não é um robô. Espere alguns minutos e tente de novo, ou atualize o mecanismo de download em Configurações." |
| extractor | "O YouTube mudou e o download falhou. Atualize o mecanismo de download em Configurações e tente de novo." |
| diskfull / ffmpeg / missing / empty / unknown | "Não há espaço suficiente no disco." / "O arquivo foi baixado, mas não pôde ser convertido…" / "O mecanismo de download está faltando ou danificado. Reinstale o aplicativo." / "Esta playlist não tem nenhum vídeo que possa ser baixado." / "O download falhou. Tente de novo; se continuar falhando, atualize o mecanismo de download em Configurações." |
| Segundo plano | "O download continua em segundo plano. Pressione Ctrl+Alt+Y ou use o ícone da área de notificação para abrir a janela de novo." |

## 7. Contrato de IPC

Exposto pelo preload como `window.baixar`. Todo argumento é validado no principal; o que não bater é ignorado e registrado (sem a URL).

| Chamada (renderer → principal) | Argumentos | Retorno |
|---|---|---|
| `getState()` | — | `{settings, clipboardLink, busy, strings}` |
| `checkUrl(url)` | string ≤ 2048 | `{ok, kind: 'video'│'playlist'│'both', canonical}` ou `{ok:false, reason}` |
| `preview(url)` (v0.2) | string ≤ 2048 | `{token}`; resultados chegam pelos eventos `preview:*` |
| `chooseFolder()` | — | caminho ou `null` |
| `start({url, format, mode})` | `format` ∈ 5 chaves; `mode` ∈ `video`│`playlist` | `{jobId}` ou `{error}` |
| `confirmPlaylist(jobId, yes)` | id, boolean | — |
| `cancel(jobId)` | id | — |
| `open(jobId, what)` | id, `file`│`folder` | `{ok}` |
| `closeRequest(choice)` | `background`│`cancel`│`back` | — |
| `setSetting(key, value)` | chave da lista fechada, valor validado pelo esquema | `{ok}` |
| `ytdlpVersion()` / `updateEngine()` | — | versão / `{status, version}` |
| `openManual()` | — | — |

| Evento (principal → renderer) | Dados |
|---|---|
| `preview:thumbnail` (v0.2) | `{token, dataUrl}` ou `{token, none: true}` |
| `preview:info` (v0.2) | `{token, kind, title, channel, duration?, count?}` ou `{token, error}` |
| `job:thumbnail` (v0.2) | `{jobId, index, dataUrl}` (item atual da playlist) |
| `job:info` | `{jobId, title}` |
| `job:playlistInfo` | `{jobId, title, count, folder}` |
| `job:progress` | `{jobId, percent, downloaded, total, eta, milestone?}` (≤ 4/s) |
| `job:item` | `{jobId, index, total, title}` |
| `job:stage` | `{jobId, stage: 'merging'│'converting'}` |
| `job:done` | `{jobId, title, folder, isPlaylist, done?, total?}` |
| `job:error` | `{jobId, code}` |
| `job:cancelled` | `{jobId, kept?, folder?}` |
| `window:shown` | `{clipboardLink}` |

## 8. Dados guardados

| Onde | O quê |
|---|---|
| `%APPDATA%\BaixarYoutube\settings.json` | folder, format, announce, theme, motion, thumbnails, language, shortcut, startWithWindows |
| `%APPDATA%\BaixarYoutube\bin` | Só se a pessoa atualizar o yt-dlp: yt-dlp.exe e version.txt (usado enquanto for mais novo que o embutido) |

Nenhum histórico de links. A desinstalação pergunta se apaga as configurações.

## 9. Empacotamento e instalação

- **electron-builder**, alvo **NSIS** (instalador por usuário, sem pedir administrador, escolha da pasta, atalho no Menu Iniciar e opcional na Área de Trabalho, desinstalador) e alvo **portable** (.exe único). Ver D-04.
- `extraResources`: `resources/bin/**` fora do asar (o yt-dlp precisa ser executável).
- O instalador NSIS é acessível por padrão (diálogos Win32 padrão); conferido com NVDA em T-MAN.
- `tools/build.ts --release`: roda todos os testes, confere `resources/bin` contra `tools/binaries.json`, aplica os fuses, gera `dist/BaixarYoutube-Setup-<versão>.exe`, `dist/BaixarYoutube-<versão>-portable.exe` e os `.sha256`, e grava `reports/PROBLEMAS-<versão>.md` e `reports/RELATORIO-TESTES-<versão>.md` (mesmo processo do complemento).
- GitHub Actions (`windows-latest`): testes + build em cada tag `v*`, release com os dois executáveis e os SHA-256.

## 10. Plano de testes (resumo; detalhado em SDD-TESTES.md após aprovação)

| Grupo | Ferramenta | Conteúdo |
|---|---|---|
| T-CORE | Vitest | Porte de todos os testes do núcleo do complemento: urls, formats, progress, filenames, errors, folders, binaries, engine (com yt-dlp falso: sucesso, erro de cada código, cancelamento no meio, playlist com itens falhos) |
| T-BIN | Vitest | yt-dlp e FFmpeg reais, sem rede, com `--load-info-json` (como `test_binaries.py`) |
| T-E2E | Playwright `_electron` | Fluxo vídeo, áudio, playlist (confirmar/não), cancelar, fechar durante download (3 escolhas), instância única, atalho global, área de notificação, Configurações |
| T-KEY | Playwright | Ordem de Tab exata (RA-02), todas as teclas Alt (RA-03) nos dois idiomas, sem duplicadas, Esc, Enter, F1, foco após cada evento e após cada diálogo (RA-07) |
| T-A11Y | axe-core + `page.accessibility` + CDP `Accessibility.getFullAXTree` | Zero violações axe (WCAG 2.2 A/AA) em cada estado e tema; todo controle com nome e papel; regiões vivas com o texto certo e sem repetição (RA-04) |
| T-A11Y-TOK | Vitest | Contraste de cada par de tokens usado (seção 5.2) nos dois temas; falha o build se algum cair abaixo do mínimo |
| T-VIS | Playwright | Capturas em claro, escuro, alto contraste (forced-colors emulado), zoom 200% e 400% (sem rolagem horizontal), cartão de mídia em vídeo, áudio, playlist e sem miniatura |
| T-THUMB (v0.2) | Vitest + servidor HTTP local de teste | Só `i.ytimg.com` com id validado; redirecionamento para outro host recusado; > 2 MB, tempo esgotado e bytes que não são imagem viram "Sem miniatura"; sem cookies; nada gravado em disco; desligado = zero requisições; leitura antecipada cancelada quando a URL muda e reaproveitada pelo Baixar |
| T-MOTION (v0.2) | Playwright | Com `reducedMotion: 'reduce'` emulado e com "Animações: Desligadas", `getAnimations()` vazio e durações computadas 0 (exceto o esmaecimento ≤ 150 ms); com animações ligadas, nenhuma passa de 320 ms, as de carregamento param em 5 s, e o foco não muda durante nenhuma; nenhum deslocamento de layout (CLS = 0) quando o cartão entra |
| T-SEC | Vitest + Playwright | webPreferences, CSP, navegação bloqueada, permissões negadas, IPC com argumentos inválidos, fuses do executável, spawn sem shell, `npm audit` |
| T-I18N | Vitest | en e pt-BR com as mesmas chaves e os mesmos marcadores `{…}` |
| T-MAN | Manual | Roteiro em TESTES-MANUAIS.md com NVDA, JAWS e Narrador, lupa do Windows, alto contraste, downloads reais (vídeo, MP3, playlist pequena, playlist grande com cancelamento) e o instalador |

Regra de versão: nenhuma versão é gerada com teste falhando (igual ao complemento).

## 11. Etapas de implementação (depois da aprovação)

1. Esqueleto: package.json, TypeScript, Electron endurecido, janela vazia, testes de segurança.
2. Porte do núcleo + testes T-CORE e T-BIN (binários de `tools/binaries.json`).
3. Tokens e componentes (tokens.css, base.css, components.css) + T-A11Y-TOK.
4. Janela principal, IPC, fluxo de vídeo, regiões vivas, teclas de acesso.
4a. (v0.2) Cartão de mídia, leitura antecipada, miniaturas (RS-11) e animações A-01 a A-12, com T-THUMB e T-MOTION.
5. Playlists e diálogos.
6. Área de notificação, segundo plano, atalho global, notificações, Configurações.
7. Manual, i18n en, ícones.
8. Empacotamento NSIS + portable, build de release, GitHub Actions.
9. Rodada completa de testes automáticos e entrega do roteiro manual.

## 12. Riscos e decisões

Aprovadas em 24/10/2026 com as recomendações deste documento; só R-04 continua pendente.

| # | Risco / decisão | Tratamento |
|---|---|---|
| D-01 | Reaproveitar a lógica do complemento portada para TypeScript (em vez de chamar o Python) | Recomendado: um só runtime, sem Python embutido; os testes portados garantem o mesmo comportamento |
| D-02 | Uso da identidade do Nubank | **Aprovado:** usar cores, tokens e componentes, mas não o nome, logotipo ou símbolo do Nubank (marca registrada). O aplicativo se chama "Baixar YouTube" |
| D-03 | Fonte Nu Sans é proprietária | **Aprovado:** pilha que usa Nu Sans se instalada e Segoe UI Variable como padrão. Se você tiver licença dos arquivos da fonte, eles podem ir em `src/renderer/fonts` |
| D-04 | Instalador NSIS + versão portátil | **Aprovado:** os dois |
| D-05 | Fechar sem download encerra o aplicativo (não fica na área de notificação) | **Aprovado:** encerra; o atalho global só funciona com o aplicativo aberto ou com "Iniciar com o Windows" ligado |
| D-06 | Atalho global Ctrl+Alt+Y | **Aprovado.** Conferir contra NVDA, JAWS e Narrador (T-ACC-12); configurável e desligável |
| D-07 | Sem assinatura de código | O Windows SmartScreen vai avisar "editor desconhecido" na primeira execução; documentado no manual. Assinar exige certificado pago |
| D-08 | Licença GPL-2.0 (igual ao complemento) | Recomendado; compatível com FFmpeg GPL chamado como programa separado |
| D-09 | Sem framework de interface (React etc.) | Recomendado: uma tela, HTML nativo é o mais acessível e o mais leve; menos dependências (RS-10) |
| D-10 | Tokens de contraste ajustados (✱ na seção 5.2) | Recomendado: mantém a aparência do Nubank e passa no WCAG AA/AAA |
| D-11 | (v0.2) Miniatura buscada direto em `i.ytimg.com` pelo id, antes de clicar em Baixar | Recomendado: aparece em menos de 1 s, sem esperar o yt-dlp. Custo: uma requisição ao servidor de imagens do YouTube por link colado (desligável em Configurações) |
| D-12 | (v0.2) Leitura antecipada (`-J`) ao colar o link | Recomendado: mostra título e duração antes de baixar e o download começa mais rápido. Custo: abre o yt-dlp (~ 2 s) para cada link novo, mesmo que a pessoa desista |
| D-13 | (v0.2) Miniatura decorativa (`alt=""`) | Recomendado: o mesmo conteúdo já está em texto ao lado; descrever a imagem repetiria o título. Alternativa: `alt="Miniatura de <título>"` |
| R-01 | O YouTube muda e o download para | Botão "Atualizar o mecanismo de download" e mensagem orientando |
| R-02 | Termos de Serviço e direitos autorais | Aviso no manual e na primeira execução; sem contas, cookies ou contorno de DRM |
| R-03 | Antivírus bloquear o yt-dlp.exe | Mensagem "mecanismo… danificado" e orientação no manual |
| R-04 | yt-dlp avisa da falta de runtime JavaScript (Deno) | **Pendente** (herdado do complemento): embutir o Deno (~ 40 MB, MIT) ou esperar. Com Electron, uma alternativa é apontar o yt-dlp para o Node do próprio Electron, mas isso exige o fuse RunAsNode ligado, o que contraria RS-09; recomendado não fazer |
| R-05 | Tamanho (~ 140 MB de instalador) | Aceitável para um aplicativo Electron com FFmpeg; a versão portátil tem o mesmo tamanho |
| R-06 | Chromium e leitores de tela | O Chromium expõe UIA/IA2 completos; ainda assim todos os fluxos entram no roteiro manual com NVDA, JAWS e Narrador |
