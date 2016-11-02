// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
WebInspector.ServiceWorkerCacheModel = class extends WebInspector.SDKModel {
  /**
   * Invariant: This model can only be constructed on a ServiceWorker target.
   * @param {!WebInspector.Target} target
   * @param {!WebInspector.SecurityOriginManager} securityOriginManager
   */
  constructor(target, securityOriginManager) {
    super(WebInspector.ServiceWorkerCacheModel, target);

    /** @type {!Map<string, !WebInspector.ServiceWorkerCacheModel.Cache>} */
    this._caches = new Map();

    this._agent = target.cacheStorageAgent();

    this._securityOriginManager = securityOriginManager;

    /** @type {boolean} */
    this._enabled = false;
  }

  /**
   * @param {!WebInspector.Target} target
   * @return {?WebInspector.ServiceWorkerCacheModel}
   */
  static fromTarget(target) {
    if (!target.hasBrowserCapability())
      return null;
    var instance =
        /** @type {?WebInspector.ServiceWorkerCacheModel} */ (target.model(WebInspector.ServiceWorkerCacheModel));
    if (!instance)
      instance =
          new WebInspector.ServiceWorkerCacheModel(target, WebInspector.SecurityOriginManager.fromTarget(target));
    return instance;
  }

  enable() {
    if (this._enabled)
      return;

    this._securityOriginManager.addEventListener(
        WebInspector.SecurityOriginManager.Events.SecurityOriginAdded, this._securityOriginAdded, this);
    this._securityOriginManager.addEventListener(
        WebInspector.SecurityOriginManager.Events.SecurityOriginRemoved, this._securityOriginRemoved, this);

    for (var securityOrigin of this._securityOriginManager.securityOrigins())
      this._addOrigin(securityOrigin);
    this._enabled = true;
  }

  /**
   * @param {string} origin
   */
  clearForOrigin(origin) {
    this._removeOrigin(origin);
    this._addOrigin(origin);
  }

  refreshCacheNames() {
    for (var cache of this._caches.values())
      this._cacheRemoved(cache);
    this._caches.clear();
    var securityOrigins = this._securityOriginManager.securityOrigins();
    for (var securityOrigin of securityOrigins)
      this._loadCacheNames(securityOrigin);
  }

  /**
   * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
   */
  deleteCache(cache) {
    /**
     * @this {WebInspector.ServiceWorkerCacheModel}
     */
    function callback(error) {
      if (error) {
        console.error('ServiceWorkerCacheAgent error deleting cache ', cache.toString(), ': ', error);
        return;
      }
      this._caches.delete(cache.cacheId);
      this._cacheRemoved(cache);
    }
    this._agent.deleteCache(cache.cacheId, callback.bind(this));
  }

  /**
   * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
   * @param {string} request
   * @param {function()} callback
   */
  deleteCacheEntry(cache, request, callback) {
    /**
     * @param {?Protocol.Error} error
     */
    function myCallback(error) {
      if (error) {
        WebInspector.console.error(WebInspector.UIString(
            'ServiceWorkerCacheAgent error deleting cache entry %s in cache: %s', cache.toString(), error));
        return;
      }
      callback();
    }
    this._agent.deleteEntry(cache.cacheId, request, myCallback);
  }

  /**
   * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
   * @param {number} skipCount
   * @param {number} pageSize
   * @param {function(!Array.<!WebInspector.ServiceWorkerCacheModel.Entry>, boolean)} callback
   */
  loadCacheData(cache, skipCount, pageSize, callback) {
    this._requestEntries(cache, skipCount, pageSize, callback);
  }

  /**
   * @return {!Array.<!WebInspector.ServiceWorkerCacheModel.Cache>}
   */
  caches() {
    var caches = new Array();
    for (var cache of this._caches.values())
      caches.push(cache);
    return caches;
  }

  /**
   * @override
   */
  dispose() {
    for (var cache of this._caches.values())
      this._cacheRemoved(cache);
    this._caches.clear();
    if (this._enabled) {
      this._securityOriginManager.removeEventListener(
          WebInspector.SecurityOriginManager.Events.SecurityOriginAdded, this._securityOriginAdded, this);
      this._securityOriginManager.removeEventListener(
          WebInspector.SecurityOriginManager.Events.SecurityOriginRemoved, this._securityOriginRemoved, this);
    }
  }

  _addOrigin(securityOrigin) {
    this._loadCacheNames(securityOrigin);
  }

  /**
   * @param {string} securityOrigin
   */
  _removeOrigin(securityOrigin) {
    for (var opaqueId of this._caches.keys()) {
      var cache = this._caches.get(opaqueId);
      if (cache.securityOrigin === securityOrigin) {
        this._caches.delete(opaqueId);
        this._cacheRemoved(cache);
      }
    }
  }

  /**
   * @param {string} securityOrigin
   */
  _loadCacheNames(securityOrigin) {
    /**
     * @param {?Protocol.Error} error
     * @param {!Array.<!WebInspector.ServiceWorkerCacheModel.Cache>} caches
     * @this {WebInspector.ServiceWorkerCacheModel}
     */
    function callback(error, caches) {
      if (error) {
        console.error('ServiceWorkerCacheAgent error while loading caches: ', error);
        return;
      }
      this._updateCacheNames(securityOrigin, caches);
    }
    this._agent.requestCacheNames(securityOrigin, callback.bind(this));
  }

  /**
   * @param {string} securityOrigin
   * @param {!Array} cachesJson
   */
  _updateCacheNames(securityOrigin, cachesJson) {
    /**
     * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
     * @this {WebInspector.ServiceWorkerCacheModel}
     */
    function deleteAndSaveOldCaches(cache) {
      if (cache.securityOrigin === securityOrigin && !updatingCachesIds.has(cache.cacheId)) {
        oldCaches.set(cache.cacheId, cache);
        this._caches.delete(cache.cacheId);
      }
    }

    /** @type {!Set<string>} */
    var updatingCachesIds = new Set();
    /** @type {!Map<string, !WebInspector.ServiceWorkerCacheModel.Cache>} */
    var newCaches = new Map();
    /** @type {!Map<string, !WebInspector.ServiceWorkerCacheModel.Cache>} */
    var oldCaches = new Map();

    for (var cacheJson of cachesJson) {
      var cache = new WebInspector.ServiceWorkerCacheModel.Cache(
          cacheJson.securityOrigin, cacheJson.cacheName, cacheJson.cacheId);
      updatingCachesIds.add(cache.cacheId);
      if (this._caches.has(cache.cacheId))
        continue;
      newCaches.set(cache.cacheId, cache);
      this._caches.set(cache.cacheId, cache);
    }
    this._caches.forEach(deleteAndSaveOldCaches, this);
    newCaches.forEach(this._cacheAdded, this);
    oldCaches.forEach(this._cacheRemoved, this);
  }

  /**
   * @param {!WebInspector.Event} event
   */
  _securityOriginAdded(event) {
    var securityOrigin = /** @type {string} */ (event.data);
    this._addOrigin(securityOrigin);
  }

  /**
   * @param {!WebInspector.Event} event
   */
  _securityOriginRemoved(event) {
    var securityOrigin = /** @type {string} */ (event.data);
    this._removeOrigin(securityOrigin);
  }

  /**
   * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
   */
  _cacheAdded(cache) {
    this.dispatchEventToListeners(WebInspector.ServiceWorkerCacheModel.Events.CacheAdded, cache);
  }

  /**
   * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
   */
  _cacheRemoved(cache) {
    this.dispatchEventToListeners(WebInspector.ServiceWorkerCacheModel.Events.CacheRemoved, cache);
  }

  /**
   * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
   * @param {number} skipCount
   * @param {number} pageSize
   * @param {function(!Array.<!WebInspector.ServiceWorkerCacheModel.Entry>, boolean)} callback
   */
  _requestEntries(cache, skipCount, pageSize, callback) {
    /**
     * @param {?Protocol.Error} error
     * @param {!Array.<!WebInspector.ServiceWorkerCacheModel.Entry>} dataEntries
     * @param {boolean} hasMore
     */
    function innerCallback(error, dataEntries, hasMore) {
      if (error) {
        console.error('ServiceWorkerCacheAgent error while requesting entries: ', error);
        return;
      }
      var entries = [];
      for (var i = 0; i < dataEntries.length; ++i) {
        entries.push(new WebInspector.ServiceWorkerCacheModel.Entry(dataEntries[i].request, dataEntries[i].response));
      }
      callback(entries, hasMore);
    }
    this._agent.requestEntries(cache.cacheId, skipCount, pageSize, innerCallback);
  }
};

/** @enum {symbol} */
WebInspector.ServiceWorkerCacheModel.Events = {
  CacheAdded: Symbol('CacheAdded'),
  CacheRemoved: Symbol('CacheRemoved')
};

/**
 * @unrestricted
 */
WebInspector.ServiceWorkerCacheModel.Entry = class {
  /**
   * @param {string} request
   * @param {string} response
   */
  constructor(request, response) {
    this.request = request;
    this.response = response;
  }
};

/**
 * @unrestricted
 */
WebInspector.ServiceWorkerCacheModel.Cache = class {
  /**
   * @param {string} securityOrigin
   * @param {string} cacheName
   * @param {string} cacheId
   */
  constructor(securityOrigin, cacheName, cacheId) {
    this.securityOrigin = securityOrigin;
    this.cacheName = cacheName;
    this.cacheId = cacheId;
  }

  /**
   * @param {!WebInspector.ServiceWorkerCacheModel.Cache} cache
   * @return {boolean}
   */
  equals(cache) {
    return this.cacheId === cache.cacheId;
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    return this.securityOrigin + this.cacheName;
  }
};
