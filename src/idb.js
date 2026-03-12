/**
 * IndexedDB для хранения черновиков новостей и файлов.
 * Документация: https://learn.javascript.ru/indexeddb
*/
(() => {
  const DB_NAME = 'django_admin_news_drafts';
  const DB_VERSION = 1;
  const STORE_BLOBS = 'blobs';

  function openDb() {
    console.log(`Устанавливаем соединение с базой данных ${DB_NAME} версия ${DB_VERSION} ...`);

    return new Promise((resolve, reject) => {
      const openRequest = indexedDB.open(DB_NAME, DB_VERSION);

      openRequest.onerror = () => reject(openRequest.error);

      // При необходимости создаём или обновляем структуру базы данных
      openRequest.onupgradeneeded = () => {
        console.log(`Обновляем структуру базы данных ${DB_NAME} версия ${DB_VERSION} ...`);

        const db = openRequest.result;
        const existingStoreList = db.objectStoreNames;

        if (!existingStoreList.contains(STORE_BLOBS)) {
          // Создаем хранилище объектов с ключом 'key'
          db.createObjectStore(STORE_BLOBS, { keyPath: 'key' });

          console.log(`Создаем хранилище объектов с ключом 'key' ${STORE_BLOBS} ...`);
        }

        console.log(`Структура базы данных ${DB_NAME} версия ${DB_VERSION} обновлена.`);
      };

      // Успешное открытие базы данных
      openRequest.onsuccess = () => {
        console.log(`Соединение с базой данных ${DB_NAME} версия ${DB_VERSION} установлено.`);

        resolve(openRequest.result);
      }

      // Изменение версии базы данных
      openRequest.onversionchange = () => {
        console.log(`База данных ${DB_NAME} версия ${DB_VERSION} устарела. Соединение закрывается ...`);

        openRequest.close();

        const errorMessage = `База данных ${DB_NAME} устарела. Соединение закрыто. Пожалуйста, перезагрузите страницу.`;

        alert(errorMessage);

        reject(new Error(errorMessage));
      };
    });
  }

  function withStore(mode, callback) {
    console.log(`Выполняем операцию с хранилищем ${STORE_BLOBS} в режиме ${mode} ...`);

    return openDb()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_BLOBS, mode);
            const store = transaction.objectStore(STORE_BLOBS);
            const resultPromise = Promise
              .resolve()
              .then(() => callback(store));

            transaction.oncomplete = () => resolve(resultPromise);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
            transaction.oncomplete = () => console.log(`Операция с хранилищем ${STORE_BLOBS} в режиме ${mode} завершена.`);
          })
      );
  }

  async function putBlob(key, fileOrBlob) {
    console.log(`Сохраняем файл ${key} ...`);

    const value =
      fileOrBlob instanceof File
        ? {
          key,
          blob: fileOrBlob,
          name: fileOrBlob.name,
          type: fileOrBlob.type,
          lastModified: fileOrBlob.lastModified
        }
        : {
          key,
          blob: fileOrBlob,
          name: 'blob',
          type: fileOrBlob.type || ''
        };

    await withStore('readwrite', (store) => {
      store.put(value);

      console.log(`Файл ${key} сохранен.`);
    });
  }

  async function getBlob(key) {
    console.log(`Получаем файл ${key} ...`);

    return await withStore('readonly', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          resolve(req.result || null);

          console.log(`Файл ${key} получен.`);
        };
      });
    });
  }

  async function deleteBlob(key) {
    console.log(`Удаляем файл ${key} ...`);

    await withStore('readwrite', (store) => {
      store.delete(key);

      console.log(`Файл ${key} удален.`);
    });
  }

  async function deleteByPrefix(prefix) {
    console.log(`Удаляем файлы с префиксом ${prefix} ...`);

    await withStore('readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.openCursor();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return resolve();
          const k = cursor.key;
          if (typeof k === 'string' && k.startsWith(prefix)) cursor.delete();
          cursor.continue();
        };
      });

      console.log(`Файлы с префиксом ${prefix} удалены.`);
    });
  }

  window.__newsDraftIdb = { putBlob, getBlob, deleteBlob, deleteByPrefix };
})();

