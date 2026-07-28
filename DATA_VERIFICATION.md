# Проверка данных пилотной версии

Дата проверки: `2026-07-28`

## Правило публикации

На сайте остаётся одна понятная возможность для каждого из 15 выбранных протоколов. Используются официальные страницы, приложения, API, документация и каналы проектов.

Числовая ставка не скрывается только потому, что она переменная или ориентировочная. Рядом с ней обязательно показывается короткая пометка:

- текущая ставка в приложении;
- приблизительное значение;
- максимум «до X%»;
- ставка с условиями;
- официальный датированный снимок;
- ожидаемая, но не гарантированная доходность;
- зависит от конкретного пула.

## Результат ревизии v4

| Протокол | Возможность | Публичная доходность | Пояснение |
|---|---|---:|---|
| Tonstakers | GRAM → tsTON | ≈20,37% APY | Текущая оценка TON Wallet; Tonstakers сообщил максимум сети до 24%. Ставка меняется по раундам. |
| EVAA | tsUSDe supply · Main Pool | 10,04% APY | Динамический boost до 25 сентября; первые 10 000 tsUSDe; требуется TON ID. |
| STON.fi | USDe–tsUSDe pool | последний успешный снимок | v6 запрашивает точный пул и публикует 7-дневный APY; TVL берётся из официального API. |
| DeDust | TON–USDT pool | рассчитывается автоматически | Fee APR считается по полному 7-дневному окну сделок, комиссии пула, доле LP 80% и TVL по резервам. |
| Hipo | GRAM → hGRAM | ≈17,5% APY | Нормальный ориентир протокола; временный всплеск 37,66% не используется как устойчивая ставка. |
| Bemo | GRAM → bmGRAM | 3,41% APY | Текущее значение, отображаемое официальным приложением Bemo v2. |
| Affluent | USDT Lending Vault | 4,1% APY | Собственный продукт Affluent; ставка меняется при авто-ребалансировке. |
| Storm Trade | USDT liquidity vault | 4,2% APR | Текущее значение на официальном сайте; зависит от торговой активности. |
| Ethena | tsUSDe on TON | 3,84% APY | Официальный снимок на конец июня; среднее за 30 дней — 3,6%. |
| TON Wallet | USDT Earn · Re7 Labs | до 18% APY | Ожидаемая доходность по исторической стратегии, не гарантирована. |

## Исправления относительно v3

- Affluent больше не смешивается с Sentora: используется собственный `USDT Lending Vault`.
- Storm Trade обновлён с 4,46% до 4,20% APR по текущей официальной странице.
- Ethena обновлена с апрельского снимка 3,5% до июньского снимка 3,84% APY.
- Hipo больше не показывает временный или быстро устаревающий всплеск как обычную ставку.
- В v6 DeDust закреплён за конкретным пулом TON/USDT и больше не показывает общую строку каталога.
- Все кнопки ведут к официальному приложению или прямо к выбранному продукту, когда такая ссылка существует.

## Официальные источники

- Tonstakers: https://tonstakers.com/faq/en/article/what-affects-ton-staking-apy
- Tonstakers announcement: https://t.me/s/thetonstakers_ru
- TON Wallet / Tonstakers current estimate: https://t.me/s/tonwallet_news_en/139
- EVAA: https://t.me/s/evaaprotocol?before=773
- STON.fi exact pool API: https://api.ston.fi/v1/pools/EQAF6mNbKhaMrfyhdNcrEnRKW1fXA3jmkS6KM7azm9PunYx5
- DeDust TON/USDT pool: https://app.dedust.io/pools/EQA-X_yo3fzzbDbJ_0bzFWKqtRuZFIRa1sJsveZJ1YpViO3r
- DeDust fees: https://help.dedust.io/en/protocol/fees
- Hipo: https://t.me/s/hipofinance
- Bemo app: https://app.bemo.fi/
- Affluent USDT Lending Vault: https://app.affluent.org/earn/EQAGtgnr1G0XDilGURcOB3pUhl-Lo__J-TaJP0K4ey8cuSaW
- Storm Trade: https://storm.tg/
- Ethena June 2026 report: https://gov.ethenafoundation.com/t/ethena-s-june-2026-governance-update/808
- Ethena tsUSDe contract: https://docs.ethena.fi/solution-design/key-addresses
- TON Wallet / Re7 Labs: https://t.me/s/tonwallet_news_en/119

## Added in v5: five more TON DeFi projects

- **TONCO** — concentrated-liquidity pools. A single APR is not used because yield depends on the pool and selected price range.
- **Tradoor** — Perps USDT liquidity pool. APR is dynamic and comes from trading/funding-related flows; the protocol states that it is not guaranteed.
- **Torch Finance** — tgUSD staking. The table uses a 12.72% official weekly APY snapshot with a visible variable-rate note.
- **JVault** — STORM staking pool. The table uses the 17.97% APR shown on the official staking page as a pool-specific snapshot.
- **Stakee** — GRAM staking. The official page showed 21% annual yield and advertised up to 25% APY; both are qualified as variable.

The public set now contains 15 protocols and 15 representative entries. No server or database was added.


## Added in v6: exact DEX data

- STON.fi uses `GET /v1/pools/{address}`, prefers `apy_7d`, reads `lp_total_supply_usd`, and verifies reserves through `get_pool_data`.
- DeDust tracks TON/USDT by exact pool address, reads the official trade history, calculates a 7-day fee APR, and verifies reserves through `get_reserves`.
- An incomplete DeDust trade window is not published as a new APR.
- Failed API calls retain the last successful snapshot.
