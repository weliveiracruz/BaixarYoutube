# Baixar YouTube: regras do projeto

- Especificação em docs/SDD.md; toda mudança de comportamento atualiza o SDD (requisito, seção e testes) e o CHANGELOG.
- O núcleo (src/core) é TypeScript puro, sem Electron nem DOM, portado do complemento YouTubeDownloaderNVDA; mantenha os mesmos casos de teste (FUN-xx).
- Processos externos só no processo principal, com lista de argumentos, `shell: false`, URL depois de `--` e `--ignore-config` (RS-02).
- A janela não tem Node: tudo passa pelo preload (`window.baixar`), e o principal valida cada argumento (RS-07). Ganchos de teste (`BAIXAR_TEST_*`) só existem com `!app.isPackaged`.
- Acessibilidade é requisito, não acabamento: HTML nativo, teclas Alt únicas por tela (data-label com "&"), regiões vivas só pelo announcer, foco nunca perdido para o body, zero violações do axe em todos os estados e temas. Rótulos com letra sublinhada ficam num único span (senão o nome acessível se parte dentro de botões flex).
- Cores só pelos tokens de src/renderer/styles/tokens.css; tests/unit/tokens.test.ts mede o contraste.
- Versão nova: `npm run dist` (testes completos antes; nada é empacotado com falha). Binários: `tools/binaries.json` + `npm run fetch-binaries`.
- Testes manuais com leitores de tela: a pessoa usuária faz e pode não avisar; pergunte antes de dizer que estão pendentes.
