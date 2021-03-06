/**
 * This modules adds Publisher Common ID support to prebid.js.  It's a simple numeric id
 * stored in the page's domain.  When the module is included, an id is generated if needed,
 * persisted as a cookie, and automatically appended to all the bidRequest as bid.crumbs.pubcid.
 */
import * as utils from '../src/utils'
import { config } from '../src/config';

const ID_NAME = '_pubcid';
const OPTOUT_NAME = '_pubcid_optout';
const DEFAULT_EXPIRES = 525600; // 1-year worth of minutes
const PUB_COMMON = 'PublisherCommonId';
const EXP_SUFFIX = '_exp';
const COOKIE = 'cookie';
const LOCAL_STORAGE = 'html5';

let pubcidConfig = {
  enabled: true,
  interval: DEFAULT_EXPIRES,
  typeEnabled: LOCAL_STORAGE,
  readOnly: false
};

/**
 * Set an item in the storage with expiry time.
 * @param {string} key Key of the item to be stored
 * @param {string} val Value of the item to be stored
 * @param {number} expires Expiry time in minutes
 */

export function setStorageItem(key, val, expires) {
  try {
    if (expires !== undefined && expires != null) {
      const expStr = (new Date(Date.now() + (expires * 60 * 1000))).toUTCString();
      localStorage.setItem(key + EXP_SUFFIX, expStr);
    }

    localStorage.setItem(key, val);
  } catch (e) {
    utils.logMessage(e);
  }
}

/**
 * Retrieve an item from storage if it exists and hasn't expired.
 * @param {string} key Key of the item.
 * @returns {string|null} Value of the item.
 */
export function getStorageItem(key) {
  let val = null;

  try {
    const expVal = localStorage.getItem(key + EXP_SUFFIX);

    if (!expVal) {
      // If there is no expiry time, then just return the item
      val = localStorage.getItem(key);
    } else {
      // Only return the item if it hasn't expired yet.
      // Otherwise delete the item.
      const expDate = new Date(expVal);
      const isValid = (expDate.getTime() - Date.now()) > 0;
      if (isValid) {
        val = localStorage.getItem(key);
      } else {
        removeStorageItem(key);
      }
    }
  } catch (e) {
    utils.logMessage(e);
  }

  return val;
}

/**
 * Remove an item from storage
 * @param {string} key Key of the item to be removed
 */
export function removeStorageItem(key) {
  try {
    localStorage.removeItem(key + EXP_SUFFIX);
    localStorage.removeItem(key);
  } catch (e) {
    utils.logMessage(e);
  }
}

/**
 * Read a value either from cookie or local storage
 * @param {string} name Name of the item
 * @returns {string|null} a string if item exists
 */
function readValue(name) {
  let value;
  if (pubcidConfig.typeEnabled === COOKIE) {
    value = getCookie(name);
  } else if (pubcidConfig.typeEnabled === LOCAL_STORAGE) {
    value = getStorageItem(name);
    if (!value) {
      value = getCookie(name);
    }
  }

  if (value === 'undefined' || value === 'null') { return null; }

  return value;
}

/**
 * Write a value to either cookies or local storage
 * @param {string} name Name of the item
 * @param {string} value Value to be stored
 * @param {number} expInterval Expiry time in minutes
 */
function writeValue(name, value, expInterval) {
  if (name && value) {
    if (pubcidConfig.typeEnabled === COOKIE) {
      setCookie(name, value, expInterval);
    } else if (pubcidConfig.typeEnabled === LOCAL_STORAGE) {
      setStorageItem(name, value, expInterval);
    }
  }
}

export function isPubcidEnabled() { return pubcidConfig.enabled; }
export function getExpInterval() { return pubcidConfig.interval; }
export function getPubcidConfig() { return pubcidConfig; }

/**
 * Decorate ad units with pubcid.  This hook function is called before the
 * real pbjs.requestBids is invoked, and can modify its parameter.  The cookie is
 * not updated until this function is called.
 * @param {Object} config This is the same parameter as pbjs.requestBids, and config.adUnits will be updated.
 * @param {function} next The next function in the chain
 */

export function requestBidHook(next, config) {
  let adUnits = config.adUnits || $$PREBID_GLOBAL$$.adUnits;
  let pubcid = null;

  // Pass control to the next function if not enabled
  if (!pubcidConfig.enabled || !pubcidConfig.typeEnabled) {
    return next.call(this, config);
  }

  if (typeof window[PUB_COMMON] === 'object') {
    // If the page includes its own pubcid object, then use that instead.
    pubcid = window[PUB_COMMON].getId();
    utils.logMessage(PUB_COMMON + ': pubcid = ' + pubcid);
  } else {
    // Otherwise get the existing cookie
    pubcid = readValue(ID_NAME);

    if (!pubcidConfig.readOnly) {
      if (!pubcid) {
        pubcid = utils.generateUUID();
        // Update the cookie/storage with the latest expiration date
        writeValue(ID_NAME, pubcid, pubcidConfig.interval);
        // Only return pubcid if it is saved successfully
        pubcid = readValue(ID_NAME);
      } else {
        // Update the cookie/storage with the latest expiration date
        writeValue(ID_NAME, pubcid, pubcidConfig.interval);
      }
    }

    utils.logMessage('pbjs: pubcid = ' + pubcid);
  }

  // Append pubcid to each bid object, which will be incorporated
  // into bid requests later.
  if (adUnits && pubcid) {
    adUnits.forEach((unit) => {
      unit.bids.forEach((bid) => {
        Object.assign(bid, {crumbs: {pubcid}});
      });
    });
  }
  return next.call(this, config);
}

// Helper to set a cookie
export function setCookie(name, value, expires) {
  let expTime = new Date();
  expTime.setTime(expTime.getTime() + expires * 1000 * 60);
  window.document.cookie = name + '=' + encodeURIComponent(value) + ';path=/;expires=' +
    expTime.toGMTString();
}

// Helper to read a cookie
export function getCookie(name) {
  if (name && window.document.cookie) {
    let m = window.document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]*)\\s*(;|$)');
    return m ? decodeURIComponent(m[2]) : null;
  }
  return null;
}

/**
 * Configuration function
 * @param {boolean} enable Enable or disable pubcid.  By default the module is enabled.
 * @param {number} expInterval Expiration interval of the cookie in minutes.
 * @param {string} type Type of storage to use
 * @param {boolean} readOnly Read but not update id
 */

export function setConfig({ enable = true, expInterval = DEFAULT_EXPIRES, type = 'html5,cookie', readOnly = false } = {}) {
  pubcidConfig.enabled = enable;
  pubcidConfig.interval = parseInt(expInterval, 10);
  if (isNaN(pubcidConfig.interval)) {
    pubcidConfig.interval = DEFAULT_EXPIRES;
  }

  pubcidConfig.readOnly = readOnly;

  // Default is to use local storage. Fall back to
  // cookie only if local storage is not supported.

  pubcidConfig.typeEnabled = null;

  const typeArray = type.split(',');
  for (let i = 0; i < typeArray.length; ++i) {
    const name = typeArray[i].trim();
    if (name === COOKIE) {
      if (utils.cookiesAreEnabled()) {
        pubcidConfig.typeEnabled = COOKIE;
        break;
      }
    } else if (name === LOCAL_STORAGE) {
      if (utils.hasLocalStorage()) {
        pubcidConfig.typeEnabled = LOCAL_STORAGE;
        break;
      }
    }
  }
}

/**
 * Initialize module by 1) subscribe to configuration changes and 2) register hook
 */
export function initPubcid() {
  config.getConfig('pubcid', config => setConfig(config.pubcid));

  if (!readValue(OPTOUT_NAME)) {
    $$PREBID_GLOBAL$$.requestBids.before(requestBidHook);
  }
}

initPubcid();
