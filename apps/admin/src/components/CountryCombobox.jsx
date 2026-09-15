import { Combobox } from '@headlessui/react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildBillingCountries } from '../lib/billingCountryCatalog.js'

function normalized(value, locale) {
  return String(value || '').toLocaleLowerCase(locale).replace(/\s+/g, ' ').trim()
}

export default function CountryCombobox({ value, onChange, disabled = false, required = false, error = '' }) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'tr-TR'
  const countries = useMemo(() => buildBillingCountries(locale), [locale])
  const selectedCountry = countries.find((country) => country.code === value) || null
  const filteredCountries = useMemo(() => {
    const needle = normalized(query, locale)
    if (!needle) return countries
    return countries.filter((country) => (
      normalized(country.name, locale).includes(needle) || country.code.toLowerCase().includes(needle)
    ))
  }, [countries, locale, query])

  return (
    <Combobox
      value={selectedCountry}
      onChange={(country) => {
        onChange(country?.code || '')
        setQuery('')
      }}
      disabled={disabled}
    >
      <div className="relative">
        <Combobox.Label className="text-sm font-medium">{t('billing.country.label')}</Combobox.Label>
        <div className="relative mt-1">
          <Combobox.Input
            className={`w-full rounded-xl border bg-white px-3 py-2.5 pr-10 text-sm outline-none focus:ring-2 disabled:bg-gray-100 ${error ? 'border-red-500 focus:border-red-600 focus:ring-red-100' : 'border-[var(--billing-line)] focus:border-[var(--billing-accent)] focus:ring-[var(--billing-accent-soft)]'}`}
            displayValue={(country) => country ? `${country.name} (${country.code})` : ''}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('billing.country.placeholder')}
            autoComplete="country-name"
            required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'billing-country-error' : undefined}
          />
          <Combobox.Button className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3 text-[var(--billing-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--billing-accent)]">
            <ChevronUpDownIcon className="h-5 w-5" aria-hidden="true" />
          </Combobox.Button>
        </div>
        {error && <p id="billing-country-error" className="mt-1 text-xs text-red-700" role="alert">{error}</p>}
        <Combobox.Options className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-[var(--billing-line)] bg-white p-1 shadow-xl focus:outline-none">
          {filteredCountries.length === 0 ? (
            <div className="px-3 py-4 text-sm text-[var(--billing-muted)]">{t('billing.country.noResults')}</div>
          ) : filteredCountries.map((country) => (
            <Combobox.Option
              key={country.code}
              value={country}
              className={({ active }) => `flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm ${active ? 'bg-[var(--billing-accent-soft)] text-[var(--billing-accent)]' : 'text-[var(--billing-ink)]'}`}
            >
              {({ selected }) => (
                <>
                  <span className="truncate">{country.name}</span>
                  <span className="ml-3 flex items-center gap-2 font-mono text-xs text-[var(--billing-muted)]">
                    {country.code}
                    {selected && <CheckIcon className="h-4 w-4 text-[var(--billing-accent)]" aria-hidden="true" />}
                  </span>
                </>
              )}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </div>
    </Combobox>
  )
}
