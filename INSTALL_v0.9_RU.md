# TON DeFi Believers v0.9 — Metrics Engine

## Что добавлено

- единый Metrics Engine;
- вычисление эквивалентного APY для показателей APR;
- базовая формула Fee APR для DEX-пулов;
- функция расчёта TVL из резервов и цен;
- оценка качества данных Confidence Score;
- информационная оценка риска;
- происхождение доходности: API, расчёт агрегатора или ручной снимок;
- слои данных:
  - `data/normalized/`
  - `data/published/`
  - `data/protocols/`
- новый файл `data/metrics.json`;
- обратная совместимость с существующим сайтом через
  `data/opportunities.json`;
- автоматическое исключение неоднозначных пулов из published-слоя;
- тесты Metrics Engine.

Это фундамент для следующих интеграций DeDust on-chain, EVAA,
Tonstakers, Hipo и Bemo.

## Твои действия

1. Распакуй ZIP.
2. Скопируй содержимое папки
   `ton-defi-believers-update-v0.9`
   в локальную папку репозитория.
3. Подтверди замену файлов.
4. В GitHub Desktop укажи Summary:

```text
Add Metrics Engine
```

5. Нажми `Commit to main`.
6. При необходимости нажми `Fetch origin` / `Pull origin`.
7. Нажми `Push origin`.
8. Дождись зелёного workflow `Update DeFi data`.

## Что прислать после запуска

Из `data/collector-report.json` пришли блок `summary`.

Из `data/metrics.json` пришли блок `summary`.

Полные файлы присылать не нужно.
