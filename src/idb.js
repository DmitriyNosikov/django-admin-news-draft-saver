/**
 * IndexedDB для хранения черновиков новостей и файлов.
 * Документация: https://learn.javascript.ru/indexeddb
*/
(() => {
  const DB_NAME = 'django_admin_news_drafts';
  const DB_VERSION = 1;
  const STORE_BLOBS = 'blobs';

  function openDb() {
    const loggerPrefix = '[OPEN DB]';

    console.log(`${loggerPrefix} Устанавливаем соединение с базой данных ${DB_NAME} версия ${DB_VERSION} ...`);

    return new Promise((resolve, reject) => {
      const openRequest = indexedDB.open(DB_NAME, DB_VERSION);

      openRequest.onerror = () => reject(openRequest.error);

      // При необходимости создаём или обновляем структуру базы данных
      openRequest.onupgradeneeded = () => {
        console.log(`${loggerPrefix} Обновляем структуру базы данных ${DB_NAME} версия ${DB_VERSION} ...`);

        const db = openRequest.result;
        const existingStoreList = db.objectStoreNames;

        if (!existingStoreList.contains(STORE_BLOBS)) {
          // Создаем хранилище объектов с ключом 'key'
          db.createObjectStore(STORE_BLOBS, { keyPath: 'key' });

          console.log(`${loggerPrefix} Создаем хранилище объектов с ключом 'key' ${STORE_BLOBS} ...`);
        }

        console.log(`${loggerPrefix} Структура базы данных ${DB_NAME} версия ${DB_VERSION} обновлена.`);
      };

      // Успешное открытие базы данных
      openRequest.onsuccess = () => {
        console.log(`${loggerPrefix} Соединение с базой данных ${DB_NAME} версия ${DB_VERSION} установлено.`);

        resolve(openRequest.result);
      }

      // Изменение версии базы данных
      openRequest.onversionchange = () => {
        console.log(`${loggerPrefix} База данных ${DB_NAME} версия ${DB_VERSION} устарела. Соединение закрывается ...`);

        openRequest.close();

        const errorMessage = `${loggerPrefix} База данных ${DB_NAME} устарела. Соединение закрыто. Пожалуйста, перезагрузите страницу.`;

        alert(errorMessage);

        reject(new Error(errorMessage));
      };
    });
  }

  function withStore(mode, callback) {
    const loggerPrefix = '[STORE OPERATION]';

    console.log(`${loggerPrefix} Выполняем операцию с хранилищем ${STORE_BLOBS} в режиме ${mode} ...`);

    return openDb()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_BLOBS, mode);
            const store = transaction.objectStore(STORE_BLOBS);
            const resultPromise = Promise
              .resolve()
              .then(() => callback(store));

            transaction.oncomplete = () => {
              console.log(`${loggerPrefix} Операция с хранилищем ${STORE_BLOBS} в режиме ${mode} завершена.`);

              resolve(resultPromise);
            };

            transaction.onerror = () => {
              console.log(`${loggerPrefix} Транзакция выполнена с ошибкой.`);

              reject(transaction.error);
            }

            transaction.onabort = () => {
              console.log(`${loggerPrefix} Транзакция отменена.`);

              reject(transaction.error);
            }
          })
      );
  }

  /**
   * Читает File/Blob в ArrayBuffer через FileReader.
   * Так мы явно сохраняем байты файла, а не ссылку — восстановление работает надёжно.
   */
  function readAsArrayBuffer(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(fileOrBlob);
    });
  }

  async function putBlob(key, fileOrBlob) {
    const loggerPrefix = '[SAVE BLOB]';

    const name = fileOrBlob instanceof File ? fileOrBlob.name : 'blob';
    const type = fileOrBlob.type || '';
    const lastModified = fileOrBlob instanceof File ? fileOrBlob.lastModified : Date.now();

    console.log(`${loggerPrefix} Сохраняем файл ${name} (читаем содержимое) ...`);

    const buffer = await readAsArrayBuffer(fileOrBlob);

    const fileData = {
      key,
      buffer,
      name,
      type,
      lastModified
    };

    await withStore('readwrite', (store) => {
      const putRequest = store.put(fileData);

      putRequest.onerror = () => {
        console.log(`${loggerPrefix} Ошибка при сохранении файла ${name}:`, putRequest.error);
      };

      putRequest.onsuccess = () => {
        console.log(`${loggerPrefix} Файл ${name} сохранен.`);
      };
    });
  }

  async function getBlob(key) {
    const loggerPrefix = '[GET BLOB]';

    console.log(`${loggerPrefix} Получаем файл по ключу ${key} ...`);

    const row = await withStore('readonly', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.get(key);

        req.onerror = () => {
          console.log(`${loggerPrefix} Ошибка при получении файла по ключу ${key}:`, req.error);
          reject(req.error);
        };

        req.onsuccess = () => {
          resolve(req.result || null);

          if (req.result) {
            console.log(`${loggerPrefix} Файл ${req.result.name} получен.`);
          }
        };
      });
    });

    if (!row) return null;

    // Новый формат: храним ArrayBuffer, собираем Blob
    if (row.buffer) {
      return {
        blob: new Blob([row.buffer], { type: row.type || '' }),
        name: row.name || 'file',
        type: row.type || '',
        lastModified: row.lastModified ?? Date.now()
      };
    }

    // Старый формат: в хранилище лежал blob/File (обратная совместимость)
    return row;
  }

  async function deleteBlob(key) {
    const loggerPrefix = '[DELETE BLOB]';

    console.log(`${loggerPrefix} Удаляем файл по ключу${key} ...`);

    await withStore('readwrite', (store) => {
      store.delete(key);

      console.log(`${loggerPrefix} Файл по ключу ${key} успешно удален.`);
    });
  }

  async function deleteByPrefix(prefix) {
    const loggerPrefix = '[DELETE BY PREFIX]';

    console.log(`${loggerPrefix} Удаляем файлы с префиксом ${prefix} ...`);

    await withStore('readwrite', (store) => {
      return new Promise((resolve, reject) => {
        // Документация: https://learn.javascript.ru/indexeddb#kursory
        const req = store.openCursor();

        req.onerror = () => reject(req.error);

        req.onsuccess = () => {
          const cursor = req.result;

          if (!cursor) {
            return resolve();
          }

          const cursorKey = cursor.key;

          if (typeof cursorKey === 'string' && cursorKey.startsWith(prefix)) {
            cursor.delete();
          }

          console.log(`${loggerPrefix} Файл ${cursorKey} удален.`);

          cursor.continue();
        };
      });
    });
  }

  window.__newsDraftIdb = { putBlob, getBlob, deleteBlob, deleteByPrefix };
})();

