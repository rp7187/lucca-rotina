# Lucca · Rotina

Registro de **mamadas** (horário, duração e peito) e **sonecas** (horário e duração) do Lucca, com página de
estatísticas para acompanhar a rotina.

- Roda no navegador (Safari no iPhone) e pode ser instalado na tela de início como um app (PWA), sem loja de apps.
- **Todos os dados ficam no celular** (IndexedDB). Nada é enviado para servidor.
- Funciona offline depois da primeira visita.
- Leve: ~18 KB (gzip) de JS + CSS, sem dependências além do Preact.

## Uso no iPhone

1. Abrir o endereço no **Safari**.
2. **Compartilhar → Adicionar à Tela de Início**.
3. Em **Ajustes → Exportar backup**, salvar um backup de tempos em tempos (Arquivos/iCloud). O Safari pode apagar
   dados de sites pouco usados; instalado na tela de início o risco é menor, mas o backup é a garantia.

## Desenvolvimento

```bash
npm install
npm run dev       # http://localhost:5173 (também na rede local, para abrir no celular)
npm run build     # gera dist/ (site estático)
npm run preview   # serve o build em http://localhost:4173
```

Stack: Vite + Preact + TypeScript. Gráficos em SVG próprio. Service worker em `public/sw.js`.

## Dados

| Registro | Campos |
|---|---|
| Mamada | início, fim, trechos por peito (E/D) — trocar de lado no meio da mamada abre um novo trecho |
| Soneca | início, fim |

Registros em andamento têm `end = null`. Estatísticas: médias por dia usam só dias completos (hoje aparece nos
gráficos, não nas médias); intervalos acima de 12 h são tratados como falta de registro.
