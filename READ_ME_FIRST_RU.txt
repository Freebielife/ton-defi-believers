TON DeFi Believers — финальная сборка v8.2

В архиве есть две важные части:

1) Весь корень проекта — для GitHub.
   Скопируйте все файлы поверх существующего локального репозитория,
   не удаляя скрытую папку .git. Затем Commit → Push origin.

2) Папка RESISTANCE_UPLOAD — только для Resistance Tools.
   После успешного GitHub Actions сделайте Pull origin и выберите именно
   папку RESISTANCE_UPLOAD в TON Sites → Создать → Загрузить файлы.
   Внутри неё index.html находится сразу в корне.

GitHub Actions:
- запускает обновление сразу после загрузки кода;
- повторяет проверку каждый час, на 17-й минуте;
- обновляет public и RESISTANCE_UPLOAD;
- публикует public через GitHub Pages.

Порядок:
1. Загрузить проект на GitHub.
2. Дождаться зелёных Update DeFi data и Deploy static site.
3. В GitHub Desktop нажать Fetch origin → Pull origin.
4. Проверить сайт на GitHub Pages.
5. В Resistance Tools выбрать папку RESISTANCE_UPLOAD и домен tondefibelievers.ton.

Не загружайте ZIP как файл внутрь TON Storage. Resistance Tools должна получить
распакованную папку RESISTANCE_UPLOAD, содержащую index.html.
