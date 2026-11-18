/**
 * Connection point for the external file scanning service.
 *
 * Scanning (malware, and possibly personal-data checks) is done by a separate
 * service, not by this API. Until a scanner is registered this does nothing and
 * uploads keep scanStatus "not_scanned". The connector for that service will
 * call registerScanner() at startup; how verdicts are reported back is part of
 * that service's contract and is not defined here yet.
 */
const { FormUpload } = require('@contexthub/common');

let scanner = null;

function registerScanner(fn) {
  if (fn !== null && typeof fn !== 'function') {
    throw new TypeError('scanner must be a function or null');
  }
  scanner = fn;
}

function isEnabled() {
  return typeof scanner === 'function';
}

/**
 * Ask for the given uploads to be scanned. Never throws: a scanner outage must
 * not fail a form submission.
 */
async function requestScan(uploads = []) {
  if (!isEnabled() || !uploads.length) {
    return { requested: 0 };
  }

  let requested = 0;
  for (const upload of uploads) {
    try {
      await scanner(upload);
      await FormUpload.updateOne(
        { _id: upload._id, scanStatus: 'not_scanned' },
        { $set: { scanStatus: 'pending' } }
      );
      requested += 1;
    } catch (error) {
      console.error('[FileScan] Failed to request scan:', error.message);
    }
  }
  return { requested };
}

module.exports = {
  registerScanner,
  isEnabled,
  requestScan
};
