// Installed plugins, kept in this browser (IndexedDB phosphor-plugins): one record per plugin,
// { id, manifest, enabled, source: 'file', installedAt }.
function database() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-plugins', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('plugins', { keyPath: 'id' });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function inStore(mode, use) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('plugins', mode), request = use(tx.objectStore('plugins'));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error); // out of room, say
    });
  } finally {
    db.close();
  }
}

export const loadPlugins = () => inStore('readonly', (plugins) => plugins.getAll());
export const putPlugin = async (record) => { await inStore('readwrite', (plugins) => plugins.put(record)); };
export const deletePlugin = async (id) => { await inStore('readwrite', (plugins) => plugins.delete(id)); };
