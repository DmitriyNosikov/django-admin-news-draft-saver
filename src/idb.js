/**
 * IndexedDB для хранения черновиков новостей и файлов.
 * Документация: https://learn.javascript.ru/indexeddb
*/
(() => {
  const DB_NAME = 'django_admin_news_drafts';
  const DB_VERSION = 1;
  const STORE_BLOBS = 'blobs';

  function openDb() {
    return new Promise((resolve, reject) => {
      const openRequest = indexedDB.open(DB_NAME, DB_VERSION);

      openRequest.onerror = () => reject(openRequest.error);

      // При необходимости создаём или обновляем структуру базы данных
      openRequest.onupgradeneeded = () => {
        const db = openRequest.result;

        if (!db.objectStoreNames.contains(STORE_BLOBS)) {
          // Создаем хранилище объектов с ключом 'key'
          db.createObjectStore(STORE_BLOBS, { keyPath: 'key' });
        }
      };

      // Успешное открытие базы данных
      openRequest.onsuccess = () => resolve(openRequest.result);

      // Изменение версии базы данных
      openRequest.onversionchange = () => {
        openRequest.close();

        const errorMessage = `База данных ${DB_NAME} устарела. Соединение закрыто. Пожалуйста, перезагрузите страницу.`;

        alert(errorMessage);

        reject(new Error(errorMessage));
      };
    });
  }

  function withStore(mode, callback) {
    return openDb()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_BLOBS, mode);
            const store = tx.objectStore(STORE_BLOBS);
            const resultPromise = Promise
              .resolve()
              .then(() => callback(store));

            tx.oncomplete = () => resolve(resultPromise);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          })
      );
  }

  async function putBlob(key, fileOrBlob) {
    const value =
      fileOrBlob instanceof File
        ? {
          key,
          blob: fileOrBlob,
          name: fileOrBlob.name,
          type: fileOrBlob.type,
          lastModified: fileOrBlob.lastModified
        }
        : { key, blob: fileOrBlob, name: 'blob', type: fileOrBlob.type || '' };

    await withStore('readwrite', (store) => {
      store.put(value);
    });
  }

  async function getBlob(key) {
    return await withStore('readonly', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result || null);
      });
    });
  }

  async function deleteBlob(key) {
    await withStore('readwrite', (store) => {
      store.delete(key);
    });
  }

  async function deleteByPrefix(prefix) {
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
    });
  }

  window.__newsDraftIdb = { putBlob, getBlob, deleteBlob, deleteByPrefix };
})();

