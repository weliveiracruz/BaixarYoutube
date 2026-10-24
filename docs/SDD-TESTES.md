# Plano de testes do Baixar YouTube

Complementa a seção 10 do SDD. Todos os grupos automáticos rodam em `npm test` e são obrigatórios em `npm run dist`.

| Grupo | Arquivo | Casos | O que garante |
|---|---|---|---|
| T-CORE | tests/unit/core.test.ts | FUN-01 a FUN-19, FUN-21 a FUN-30 | Porte do núcleo do complemento: links (RS-01), formatos, progresso e marcos, nomes seguros, erros, comandos (RS-02), downloads com yt-dlp falso, cancelamento e limpeza, playlists, binários (RS-03), leitura antecipada (D-12) |
| T-THUMB | tests/unit/thumbnails.test.ts | T-THUMB-01 a 05 | RS-11: só i.ytimg.com com id validado, sem cookies, sem redirecionamento, ≤ 2 MB, só JPEG/PNG/WebP, cache de 20 em memória |
| T-A11Y-TOK | tests/unit/tokens.test.ts | 3 | Contraste WCAG de cada par de tokens nos temas claro e escuro; roxo #820AD1 |
| T-I18N | tests/unit/i18n.test.ts | T-I18N-01 a 04 | Mesmas chaves, marcadores e teclas "&" em pt-BR e en; tamanhos e durações; esquema fechado das configurações |
| T-BIN | tests/bin/binaries.test.ts | BIN-01 a 06 | yt-dlp e FFmpeg reais, sem rede: integridade, versões, todos os comandos aceitos pelo yt-dlp real e formato escolhido certo |
| T-E2E | tests/e2e/smoke.spec.ts, flows.spec.ts | T-E2E-01 a 12 | Janela, prévia, download de vídeo, marcos falados, validação, erros, playlists (confirmar, recusar, escolher), cancelar, fechar durante download, área de transferência |
| T-KEY | tests/e2e/a11y.spec.ts | T-KEY-01 a 06 | Ordem de Tab, teclas Alt nos dois idiomas sem repetição, Esc, F1, Ctrl+L |
| T-A11Y | tests/e2e/a11y.spec.ts | T-A11Y-01 a 03 | axe-core (WCAG 2.2 A/AA + boas práticas) com zero violações em cada estado e nos dois temas, manual incluído; regiões vivas |
| T-VIS | tests/e2e/a11y.spec.ts | T-VIS-01 a 03 | Alto contraste (forced-colors), reflow a 400% sem rolagem horizontal, alvos ≥ 44 px, anel de foco |
| T-MOTION | tests/e2e/a11y.spec.ts | T-MOTION-01 a 03 | Movimento reduzido e configuração Animações; duração ≤ 320 ms; carregamentos param em 5 s |
| T-SEC | tests/e2e/security.spec.ts | T-SEC-01 a 07 | webPreferences, CSP, navegação e janelas bloqueadas, IPC com argumentos inválidos, URL canônica depois de --, miniatura desligada sem rede, sem histórico |
| T-PKG | tools/release.mjs + verificação manual | — | Fuses do executável, resources/bin igual ao fixado, ganchos de teste ignorados no aplicativo instalado |
| T-REAL | tests/real (npm run test:real) | T-REAL-01, 02 | Download real do YouTube e mensagem certa quando o YouTube bloqueia. Fora da regra de versão (depende do YouTube) |
| T-MAN | docs/TESTES-MANUAIS.md | MAN-01 a 25 | NVDA, JAWS, Narrador, instalador, notificações, área de notificação, atalho global |
