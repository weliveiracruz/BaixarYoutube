# Baixar YouTube

Aplicativo de Windows para baixar vídeos e playlists do YouTube e do YouTube Music, ou só o áudio (MP3, M4A), numa janela simples e **completamente acessível**: leitor de tela (NVDA, JAWS, Narrador), teclado, lupa, alto contraste e zoom. Mesmas funções do complemento [YouTubeDownloaderNVDA](https://github.com/weliveiracruz/YouTubeDownloaderNVDA), sem depender do NVDA, com a linguagem visual do design system do Nubank.

- Especificação: [docs/SDD.md](docs/SDD.md)
- Plano de testes: [docs/SDD-TESTES.md](docs/SDD-TESTES.md) e roteiro manual: [docs/TESTES-MANUAIS.md](docs/TESTES-MANUAIS.md)
- Manual do usuário: dentro do aplicativo (F1), em [src/manual](src/manual)

## Desenvolvimento

Requisitos: Windows 10/11 x64, Node.js 22 ou mais novo.

```bash
npm ci
```

```bash
npm run fetch-binaries
```

```bash
npm start
```

`fetch-binaries` baixa o yt-dlp e o FFmpeg fixados em `tools/binaries.json` (versão e SHA-256) para `resources/bin` (fora do git).

## Testes

```bash
npm test
```

Roda os tipos, os testes do núcleo (Vitest, com yt-dlp falso), os programas reais sem rede e os testes da janela (Playwright + axe-core). `npm run test:real` faz um download de verdade do YouTube (precisa de internet e fica fora da regra de versão).

## Versão

```bash
npm run dist
```

Só gera `dist/BaixarYoutube-Setup-<versão>.exe` e `dist/BaixarYoutube-<versão>-portable.exe` (com `.sha256`) se todos os testes passarem; grava `reports/RELATORIO-TESTES-<versão>.md` e `reports/PROBLEMAS-<versão>.md`.

## Aviso

Baixe só o que você tem direito de baixar, respeitando os direitos autorais e os Termos de Serviço do YouTube. O aplicativo não usa contas, cookies nem guarda histórico. As cores seguem a linguagem visual do Nubank; o aplicativo não é um produto do Nubank e não usa o nome nem o logotipo dele.

## Licenças

Baixar YouTube: GPL-2.0 (COPYING.txt). yt-dlp: Unlicense. FFmpeg: GPL (build shared do yt-dlp/FFmpeg-Builds), chamado como programa separado.
