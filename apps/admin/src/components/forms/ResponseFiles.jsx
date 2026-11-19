import { useState } from 'react';
import {
  ArrowDownTrayIcon,
  DocumentIcon,
  PhotoIcon,
  FilmIcon,
  MusicalNoteIcon,
  GlobeAltIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { getResponseFileDownload, promoteResponseFile } from '../../lib/api/forms';
import {
  canPromoteFile,
  describeFileError,
  describeFileState,
  describeScanStatus,
  formatBytes,
} from './formFileUtils';

function FileTypeIcon({ mimeType = '' }) {
  const className = 'h-5 w-5 flex-shrink-0 text-gray-400';
  if (mimeType.startsWith('image/')) return <PhotoIcon className={className} />;
  if (mimeType.startsWith('video/')) return <FilmIcon className={className} />;
  if (mimeType.startsWith('audio/')) return <MusicalNoteIcon className={className} />;
  return <DocumentIcon className={className} />;
}

const formatDay = (value) => new Date(value).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });

function startDownload(url) {
  // The link is served as an attachment, so the browser downloads it without leaving the page.
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Files submitted in one file field of a response, with download and
 * "move to media library" actions.
 */
export default function ResponseFiles({ files, fileStates = {}, formId, responseId, canPublish = false, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [error, setError] = useState('');
  const [published, setPublished] = useState({});

  const handleDownload = async (uploadId) => {
    setError('');
    setBusy(`download:${uploadId}`);
    try {
      const file = await getResponseFileDownload({ formId, responseId, uploadId });
      startDownload(file.url);
    } catch (err) {
      setError(describeFileError(err, 'Dosya indirilemedi. Lütfen tekrar deneyin.'));
    } finally {
      setBusy(null);
    }
  };

  const handlePromote = async (uploadId) => {
    setError('');
    setBusy(`promote:${uploadId}`);
    try {
      const media = await promoteResponseFile({ formId, responseId, uploadId });
      setPublished((prev) => ({ ...prev, [uploadId]: media }));
      setConfirming(null);
      onChanged?.();
    } catch (err) {
      setError(describeFileError(err, 'Dosya medya kütüphanesine taşınamadı.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {files.map((file) => {
          const state = published[file.uploadId]
            ? { ...fileStates[file.uploadId], status: 'promoted' }
            : fileStates[file.uploadId] || (file.uploadId ? { status: 'deleted' } : { status: 'attached' });
          const availability = describeFileState(state);
          const scan = describeScanStatus(state.scanStatus);
          const isPrivateUpload = Boolean(file.uploadId);
          const showPromote = isPrivateUpload && canPublish && canPromoteFile(state, file.mimeType);
          const mediaUrl = published[file.uploadId]?.url;

          return (
            <li key={file.uploadId || file.filename} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <FileTypeIcon mimeType={file.mimeType} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900" title={file.filename}>{file.filename || 'Dosya'}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                    {file.size ? <span>{formatBytes(file.size)}</span> : null}
                    {isPrivateUpload && (
                      <span className={clsx('rounded px-1.5 py-0.5 font-medium', availability.className)}>
                        {availability.label}
                      </span>
                    )}
                    {isPrivateUpload && availability.available && (
                      <span className={clsx('rounded px-1.5 py-0.5 font-medium', scan.className)}>{scan.label}</span>
                    )}
                    {availability.available && state.retainUntil && (
                      <span>{formatDay(state.retainUntil)} tarihinde silinecek</span>
                    )}
                    {mediaUrl && (
                      <a href={mediaUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800">
                        Yayın adresini aç
                      </a>
                    )}
                  </div>
                </div>

                {isPrivateUpload && availability.available && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(file.uploadId)}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                      {busy === `download:${file.uploadId}` ? 'Hazırlanıyor…' : 'İndir'}
                    </button>
                    {showPromote && (
                      <button
                        type="button"
                        onClick={() => setConfirming(file.uploadId)}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        <GlobeAltIcon className="h-4 w-4" />
                        Medyaya taşı
                      </button>
                    )}
                  </div>
                )}
              </div>

              {confirming === file.uploadId && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3" role="alertdialog" aria-label="Medyaya taşıma onayı">
                  <div className="flex gap-2">
                    <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-amber-600" />
                    <div className="text-xs text-amber-900">
                      <p className="font-semibold">Bu dosya herkese açık olacak.</p>
                      <p className="mt-1">
                        Dosya medya kütüphanesine taşınır ve bağlantıyı bilen herkes erişebilir. Saklama süresi artık
                        uygulanmaz ve formdaki özel kopya silinir. Kişisel veri içermediğinden emin olun.
                        {state.scanStatus !== 'clean' && ' Dosya henüz virüs taramasından geçmedi.'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      disabled={busy !== null}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromote(file.uploadId)}
                      disabled={busy !== null}
                      className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {busy === `promote:${file.uploadId}` ? 'Taşınıyor…' : 'Herkese açık yap'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
