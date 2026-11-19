import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { getFormUploadStatus } from '../../lib/api/forms';
import { describeMissingUploadSetup } from './formFileUtils';

const SETTINGS_PATH = '/varliklar/ayarlar';

/**
 * Shown in the form builder when the form has a file field but this tenant
 * cannot receive files yet.
 */
export default function FileUploadReadinessNotice({ hasFileField, tenantId }) {
  const { data: status } = useQuery({
    queryKey: ['formUploadStatus', tenantId],
    queryFn: getFormUploadStatus,
    enabled: Boolean(hasFileField),
    staleTime: 60 * 1000,
  });

  const missing = hasFileField ? describeMissingUploadSetup(status) : [];
  if (!missing.length) return null;

  return (
    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4" role="status">
      <div className="flex gap-3">
        <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-amber-600" />
        <div className="text-sm text-amber-900">
          <p className="font-medium">Bu formdaki dosya alanları şu an gönderim kabul etmez.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {missing.map((item) => (
              <li key={item.key}>
                {item.text}
                {item.link && (
                  <>
                    {' '}
                    <Link to={SETTINGS_PATH} className="font-medium text-amber-800 underline hover:text-amber-900">
                      {item.link}
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
