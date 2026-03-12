(() => {
  const FORM_ID = 'news_form';
  const GALLERY_GROUP_ID = 'News_gallery-group';
  const CKEDITOR_TEXTAREA_ID = 'id_text';

  function isTargetPage() {
    const form = document.getElementById(FORM_ID);

    if (!form) return false;

    return (
      document.getElementById('id_title') &&
      document.getElementById('id_slug') &&
      document.getElementById('id_image') &&
      document.getElementById('id_date_from_0') &&
      document.getElementById('id_date_from_1')
    );
  }

  function getDraftKey() {
    // localStorage привязан к origin. Добавляем pathname, чтобы избежать коллизий ключей.
    return `newsDraft:${location.pathname}`;
  }

  function safeJsonParse(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function hasServerErrors() {
    // Типовые маркеры ошибок в Django Admin
    if (document.querySelector('.errornote')) return true;
    if (document.querySelector('.errorlist')) return true;
    if (document.querySelector('.errors')) return true;
    if (document.querySelector('.field-error')) return true;
    if (document.querySelector('ul.errorlist li')) return true;
    return false;
  }

  function getTextValue(id) {
    const el = document.getElementById(id);
    const textValue = el && typeof el.value === 'string'
      ? el.value
      : '';

    return textValue;
  }

  function setTextValue(id, value) {
    const el = document.getElementById(id);

    if (!el) return;

    const inputEvent = new Event('input', { bubbles: true });
    const changeEvent = new Event('change', { bubbles: true });

    el.value = value ?? '';
    el.dispatchEvent(inputEvent);
    el.dispatchEvent(changeEvent);
  }

  function getCkeditorHtml() {
    const ckEditorTextarea = document.getElementById(CKEDITOR_TEXTAREA_ID);

    if (!ckEditorTextarea) return '';

    // CKEditor WYSIWYG редактор, встроенный в Django
    const ckEditor = window.CKEDITOR;
    const ckEditorInstance = ckEditor?.instances?.[CKEDITOR_TEXTAREA_ID];

    if (ckEditorInstance && typeof ckEditorInstance.getData === 'function') {
      return ckEditorInstance.getData() || '';
    }

    return ckEditorTextarea.value || '';
  }

  function setCkeditorHtml(html) {
    const ckEditorTextarea = document.getElementById(CKEDITOR_TEXTAREA_ID);

    if (!ckEditorTextarea) return;

    const ckEditor = window.CKEDITOR;
    const ckEditorInstance = ckEditor?.instances?.[CKEDITOR_TEXTAREA_ID];

    if (ckEditorInstance && typeof ckEditorInstance.setData === 'function') {
      ckEditorInstance.setData(html ?? '');
      return;
    }

    const inputEvent = new Event('input', { bubbles: true });
    const changeEvent = new Event('change', { bubbles: true });

    ckEditorTextarea.value = html ?? '';
    ckEditorTextarea.dispatchEvent(inputEvent);
    ckEditorTextarea.dispatchEvent(changeEvent);
  }

  function getGalleryFileInputs() {
    // Берём только реальные строки (исключаем шаблоны (template) empty-form с __prefix__)
    const inputsSelector = `#${GALLERY_GROUP_ID} input[type="file"][id^="id_News_gallery-"][id$="-image_f"]`;
    const galleryFileInputs = document.querySelectorAll(inputsSelector);
    const filteredInputs = Array.from(galleryFileInputs)
      .filter((el) => !el.id.includes('__prefix__'));

    return filteredInputs;
  }

  function getGalleryAddRowLink() {
    return document.querySelector(`#${GALLERY_GROUP_ID} .add-row a`);
  }

  /** Возвращает количество полей «Картинка» в блоке галереи (без шаблонов). */
  function getGalleryFieldsCount() {
    const inputsCount = getGalleryFileInputs().length;

    return inputsCount;
  }

  /** Обновляет текст счётчика «Добавлено» в dropzone по текущему количеству полей галереи. */
  function updateDropZoneAddedFilesCounter(filesCounterEl) {
    if (!filesCounterEl) return;

    const n = getGalleryFieldsCount();
    filesCounterEl.textContent = n ? `Добавлено: ${n}` : '';
  }

  function setFilesOnInput(input, files) {
    if (!input) return;

    const dt = new DataTransfer();

    for (const f of files) dt.items.add(f);

    const changeEvent = new Event('change', { bubbles: true });

    input.files = dt.files;
    input.dispatchEvent(changeEvent);
  }

  /*
    * window.__newsDraftIdb - глобальный объект с методами,
    позволяющими работать с подготовленной нами IndexedDB (файл idb.js)
  */
  async function fileToIdb(key, file) {
    const idb = window.__newsDraftIdb;

    if (!idb) return;

    await idb.putBlob(key, file);
  }

  async function idbToFile(key) {
    const idb = window.__newsDraftIdb;

    if (!idb) return null;

    const row = await idb.getBlob(key);

    if (!row || !row.blob) {
      return null;
    }

    try {
      const file = new File([row.blob], row.name || 'file', {
        type: row.type || row.blob.type || '',
        lastModified: row.lastModified || Date.now()
      });

      return file;
    } catch {
      // В редких случаях конструктор File может быть недоступен — возвращаем Blob.
      return row.blob;
    }
  }

  async function saveDraftBeforeSubmit() {
    const draftKey = getDraftKey();
    const now = Date.now();

    const draft = {
      version: 1,
      pendingSubmit: true,
      savedAt: now,
      fields: {
        title: getTextValue('id_title'),
        slug: getTextValue('id_slug'),
        annotation: getTextValue('id_annotation'),
        textHtml: getCkeditorHtml(),
        cropping: getTextValue('id_cropping'),
        date_from_0: getTextValue('id_date_from_0'),
        date_from_1: getTextValue('id_date_from_1'),
        date_to_0: getTextValue('id_date_to_0'),
        date_to_1: getTextValue('id_date_to_1')
      },
      files: {
        mainImage: null,
        gallery: []
      }
    };

    // Главное изображение
    const mainImageInput = document.getElementById('id_image');
    const mainFile = mainImageInput?.files?.[0] || null;

    console.log('Основное изображение', mainFile);

    if (mainFile) {
      const key = `${draftKey}:mainImage`;

      draft.files.mainImage = {
        key, name: mainFile.name,
        type: mainFile.type,
        lastModified: mainFile.lastModified
      };

      await fileToIdb(key, mainFile);
    } else {
      draft.files.mainImage = null;
    }

    // Изображения галереи (берём выбранный файл из каждой строки, если он есть)
    const galleryInputs = getGalleryFileInputs();
    const galleryFiles = [];

    for (const input of galleryInputs) {
      const file = input.files?.[0];

      if (!file) continue;

      galleryFiles.push(file);
    }

    console.log('Изображения галереи', galleryFiles);

    // Удаляем старые blob'ы галереи для этого draftKey, чтобы не накапливать мусор
    const idb = window.__newsDraftIdb;

    if (idb) await idb.deleteByPrefix(`${draftKey}:gallery:`);

    draft.files.gallery = [];

    for (let i = 0; i < galleryFiles.length; i++) {
      const file = galleryFiles[i];
      const key = `${draftKey}:gallery:${i}`;

      const fileMeta = {
        key,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified
      }

      draft.files.gallery.push(fileMeta);

      await fileToIdb(key, file);
    }

    localStorage.setItem(draftKey, JSON.stringify(draft));
  }

  async function restoreDraftIfNeeded() {
    const draftKey = getDraftKey();
    const raw = localStorage.getItem(draftKey);
    const draft = raw ? safeJsonParse(raw) : null;
    if (!draft || !draft.fields) return;

    // Восстанавливаем только если был сабмит и сервер вернул ошибки.
    if (!draft.pendingSubmit) return;
    if (!hasServerErrors()) return;

    setTextValue('id_title', draft.fields.title);
    setTextValue('id_slug', draft.fields.slug);
    setTextValue('id_annotation', draft.fields.annotation);
    setCkeditorHtml(draft.fields.textHtml);
    if (draft.fields.cropping !== undefined) {
      setTextValue('id_cropping', draft.fields.cropping);
    }
    setTextValue('id_date_from_0', draft.fields.date_from_0);
    setTextValue('id_date_from_1', draft.fields.date_from_1);
    setTextValue('id_date_to_0', draft.fields.date_to_0);
    setTextValue('id_date_to_1', draft.fields.date_to_1);

    console.log('draft.files.mainImage', draft.files.mainImage);
    console.log('draft.files.gallery', draft.files.gallery);

    // Восстановление главного изображения
    if (draft.files?.mainImage?.key) {
      const mainImageFile = await idbToFile(draft.files.mainImage.key);
      const input = document.getElementById('id_image');

      if (input && mainImageFile) setFilesOnInput(input, [mainImageFile]);
    }

    // Восстановление изображений галереи
    const galleryFiles = draft.files?.gallery;
    const galleryMeta = Array.isArray(galleryFiles)
      ? galleryFiles
      : [];
    if (galleryMeta.length) {
      await ensureGalleryRows(galleryMeta.length);

      for (let i = 0; i < galleryMeta.length; i++) {
        const meta = galleryMeta[i];
        const f = meta?.key ? await idbToFile(meta.key) : null;

        if (!f) continue;

        const input = document.getElementById(`id_News_gallery-${i}-image_f`);

        if (input) setFilesOnInput(input, [f]);
      }
    }
  }

  async function ensureGalleryRows(count) {
    // В inline-таблице уже могут быть строки; добавляем, пока их не станет >= count.
    let inputs = getGalleryFileInputs();

    const addLink = getGalleryAddRowLink();

    if (!addLink) return;

    while (inputs.length < count) {
      addLink.click();

      await new Promise((resolve) => setTimeout(resolve, 0));

      inputs = getGalleryFileInputs();
    }
  }

  function installSubmitListener() {
    const form = document.getElementById(FORM_ID);

    if (!form) return;

    // Слушаем в capture-фазе, чтобы сохранить даже если дальше сабмит отменят.
    form.addEventListener(
      'submit',
      (event) => {
        // Не блокируем сабмит; сохраняем в фоне.
        saveDraftBeforeSubmit()
          .catch(() => { });
      },
      { capture: true }
    );
  }

  function createDropZone() {
    const galleryGroup = document.getElementById(GALLERY_GROUP_ID);

    if (!galleryGroup) return null;
    if (galleryGroup.querySelector('[data-news-gallery-dropzone="1"]')) return null;

    const container = document.createElement('div');
    container.setAttribute('data-news-gallery-dropzone', '1');
    container.style.border = '2px dashed var(--hairline-color, #cbd5e1)';
    container.style.borderRadius = '10px';
    container.style.padding = '12px';
    container.style.margin = '10px 0 14px';
    container.style.background = 'rgba(2,6,23,0.02)';

    const title = document.createElement('div');
    title.textContent = 'Drag’n’Drop: мультизагрузка в Галерею';
    title.style.fontWeight = '600';
    title.style.marginBottom = '6px';

    const hint = document.createElement('div');
    hint.innerText = `Перетащите несколько изображений сюда или выберите файлы.\nКаждый файл будет добавлен в блок "Картинка" отдельным полем.`;
    hint.style.fontSize = '12px';
    hint.style.opacity = '0.85';
    hint.style.marginBottom = '10px';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';

    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'flex';
    buttonRow.style.gap = '10px';
    buttonRow.style.alignItems = 'center';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Выбрать файлы…';
    button.className = 'button';
    button.addEventListener('click', () => input.click());

    const filesCounter = document.createElement('span');
    filesCounter.style.fontSize = '12px';
    filesCounter.style.opacity = '0.85';
    filesCounter.textContent = '';

    buttonRow.appendChild(button);
    buttonRow.appendChild(filesCounter);

    container.appendChild(title);
    container.appendChild(hint);
    container.appendChild(buttonRow);
    container.appendChild(input);

    const setHover = (on) => {
      container.style.background = on
        ? 'rgba(59,130,246,0.08)'
        : 'rgba(2,6,23,0.02)';
      container.style.borderColor = on
        ? 'rgba(59,130,246,0.65)'
        : 'var(--hairline-color, #cbd5e1)';
    };

    container.addEventListener('dragenter', (e) => {
      e.preventDefault();
      setHover(true);
    });
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      setHover(true);
    });
    container.addEventListener('dragleave', (e) => {
      e.preventDefault();
      setHover(false);
    });
    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      setHover(false);

      const files = e.dataTransfer?.files || [];
      const filteredFiles = Array.from(files)
        .filter((f) => f && f.type && f.type.startsWith('image/'));

      if (!filteredFiles.length) return;

      filesCounter.textContent = `Загружаю: ${filteredFiles.length} ...`;

      await addFilesToGallery(filteredFiles);

      updateDropZoneAddedFilesCounter(filesCounter);
    });

    input.addEventListener('change', async () => {
      const files = input.files || [];
      const filteredFiles = Array.from(files)
        .filter((f) => f && f.type && f.type.startsWith('image/'));

      if (!filteredFiles.length) return;

      filesCounter.textContent = `Загружаю: ${filteredFiles.length}`;

      await addFilesToGallery(filteredFiles);

      updateDropZoneAddedFilesCounter(filesCounter);

      input.value = '';
    });

    // Вставляем dropzone над таблицей галереи
    const fieldset = galleryGroup.querySelector('fieldset.module');

    if (fieldset) {
      fieldset.insertBefore(container, fieldset.querySelector('table') || null);
    } else {
      galleryGroup.prepend(container);
    }

    // Начальное значение счётчика (если уже есть строки)
    updateDropZoneAddedFilesCounter(filesCounter);

    // При добавлении/удалении строк в блоке «Картинка» пересчитываем «Добавлено»
    const observer = new MutationObserver(() => updateDropZoneAddedFilesCounter(filesCounter));

    observer.observe(galleryGroup, {
      childList: true,
      subtree: true
    });

    return container;
  }

  async function addFilesToGallery(files) {
    const addLink = getGalleryAddRowLink();

    if (!addLink) return;

    // Всегда добавляем новую строку на каждый файл.
    for (const file of files) {
      addLink.click();

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Берём последний input реальной строки
      const inputs = getGalleryFileInputs();
      const lastInput = inputs[inputs.length - 1];

      if (lastInput) setFilesOnInput(lastInput, [file]);
    }
  }

  function markSubmitSuccessAndCleanup() {
    // Если ошибок нет, можно сбросить флаг pendingSubmit.
    const draftKey = getDraftKey();
    const raw = localStorage.getItem(draftKey);
    const draft = raw ? safeJsonParse(raw) : null;

    if (!draft) return;
    if (draft.pendingSubmit && !hasServerErrors()) {
      draft.pendingSubmit = false;
      localStorage.setItem(draftKey, JSON.stringify(draft));
    }
  }

  async function main() {
    if (!isTargetPage()) return;

    installSubmitListener();
    createDropZone();

    // Сначала пробуем восстановить сразу; CKEditor может проинициализироваться позже — сделаем повтор.
    await restoreDraftIfNeeded();

    const ck = window.CKEDITOR;

    if (ck?.instances?.[CKEDITOR_TEXTAREA_ID] && typeof ck.instances[CKEDITOR_TEXTAREA_ID].on === 'function') {
      // Если CKEditor уже есть, но ещё не готов — восстановим повторно после instanceReady.
      try {
        ck.instances[CKEDITOR_TEXTAREA_ID].on('instanceReady', () => {
          restoreDraftIfNeeded().catch(() => { });
        });
      } catch { }
    } else {
      // Если CKEditor загрузится после document_idle — пробуем восстановить ещё раз с задержкой.
      setTimeout(() => restoreDraftIfNeeded().catch(() => { }), 1200);
    }

    markSubmitSuccessAndCleanup();
  }

  main().catch(() => { });
})();

