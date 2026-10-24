# Testes manuais do Baixar YouTube 1.0.0-beta.1

Instale `dist/BaixarYoutube-Setup-1.0.0-beta.1.exe` (ou rode a versão portátil). Repita os testes marcados com ★ no NVDA, no JAWS e no Narrador. Anote o resultado na coluna e os problemas no fim.

| ID | Passos | Esperado | NVDA | JAWS | Narrador |
|---|---|---|---|---|---|
| MAN-01 ★ | Rodar o instalador só com o teclado | Todas as telas lidas; escolha da pasta; atalhos no Menu Iniciar e na Área de Trabalho; sem pedir administrador | | | |
| MAN-02 | Abrir pela primeira vez | SmartScreen pode avisar (sem assinatura: "Mais informações" > "Executar assim mesmo"); aparece o aviso "Antes de começar" com foco em Entendi | | | |
| MAN-03 ★ | Copiar um link do YouTube no navegador e abrir o aplicativo | O link aparece no campo URL, selecionado, e é lido; a prévia mostra miniatura, título, canal e duração; é falado "Vídeo: título, duração" uma vez | | | |
| MAN-04 ★ | Tab por toda a janela | Ordem: URL, Pasta, Escolher pasta, Formato, Baixar, Situação, (Abrir arquivo, Abrir pasta), Configurações, Fechar; cada controle com nome e tecla de atalho | | | |
| MAN-05 ★ | Alt+U, Alt+D, Alt+E, Alt+F, Alt+S, Alt+G, Alt+H | Cada um vai ao controle certo (Escolher pasta e Configurações abrem) | | | |
| MAN-06 ★ | Baixar um vídeo curto em MP4 | Foco em Cancelar; progresso falado a cada 10% sem repetir; "Juntando vídeo e áudio…"; "Download concluído: título"; Abrir arquivo toca o vídeo no reprodutor do Windows | | | |
| MAN-07 | O mesmo vídeo em MP3 e em M4A | "Convertendo o arquivo…"; arquivos tocam; nada sobrescrito ("(2)" quando repete) | | | |
| MAN-08 ★ | Baixar e pressionar Alt+C no meio | "Download cancelado."; nenhum arquivo .part sobra na pasta | | | |
| MAN-09 ★ | Link inválido, link de canal, campo vazio | Mensagem lida na hora, junto ao campo, foco no campo URL | | | |
| MAN-10 ★ | Playlist pequena (até 10 vídeos) em MP3 | Pergunta com título, número e pasta; "3 de 10: título" falado; pasta nova com "001 - …"; fim com quantos foram baixados | | | |
| MAN-11 | Link de vídeo dentro de playlist | Pergunta "Só este vídeo / A playlist inteira / Voltar"; Alt+E, Alt+P, Alt+V | | | |
| MAN-12 | Playlist grande, cancelar no 3º item | Os 2 primeiros arquivos ficam; o incompleto some | | | |
| MAN-13 ★ | Esc durante um download | Pergunta; Voltar mantém; Continuar em segundo plano esconde a janela e mostra notificação; ao terminar, notificação do Windows "Download concluído" | | | |
| MAN-14 | Ctrl+Alt+Y de outro programa | A janela volta para a frente com o foco no campo URL | | | |
| MAN-15 | Ícone da área de notificação (Win+B, setas, Enter / Shift+F10) | Menu Abrir, Cancelar o download (só durante um), Sair; dica com a porcentagem | | | |
| MAN-16 ★ | Configurações: mudar anúncios para 25%, tema Escuro, Animações Desligadas, idioma English | Cada mudança vale na hora; os rótulos mudam de idioma; nada se move com animações desligadas | | | |
| MAN-17 | Configurações: novo atalho global (ex.: Ctrl+Alt+B) e Restaurar padrão | O novo atalho funciona; Tab sai do campo; combinação já usada é recusada com mensagem | | | |
| MAN-18 | Desligar "Mostrar miniatura do vídeo" | A prévia mostra "Sem miniatura" | | | |
| MAN-19 | Atualizar o mecanismo de download | "Atualizando…" e o resultado falados; a versão muda se houver nova | | | |
| MAN-20 | Alto contraste do Windows (Alt+Shift+PrtScn) | Todos os controles com borda visível, foco visível, texto legível | | | |
| MAN-21 | Ctrl+= até 300% e Lupa do Windows | Nada cortado, sem rolagem horizontal | | | |
| MAN-22 | Windows: Configurações > Acessibilidade > Efeitos visuais > Efeitos de animação desligado | O aplicativo não anima nada | | | |
| MAN-23 | F1 | Manual abre, navegável por títulos; Esc fecha | | | |
| MAN-24 | Sair pelo ícone da área de notificação durante um download | Download cancelado, parciais apagados, aplicativo fecha | | | |
| MAN-25 | Desinstalar | Remove o aplicativo; Configurações e Programas mostra "Baixar YouTube" | | | |

## Problemas encontrados

(anote aqui)
