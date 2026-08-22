import { Combobox } from '@headlessui/react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { useMemo, useState } from 'react'

const ISO_COUNTRY_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.trim().split(/\s+/)

function countryName(code) {
  try {
    return new Intl.DisplayNames(['tr'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

export const BILLING_COUNTRIES = ISO_COUNTRY_CODES
  .map((code) => ({ code, name: countryName(code) }))
  .sort((left, right) => left.name.localeCompare(right.name, 'tr'))

function normalized(value) {
  return String(value || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()
}

export default function CountryCombobox({ value, onChange, disabled = false, required = false }) {
  const [query, setQuery] = useState('')
  const selectedCountry = BILLING_COUNTRIES.find((country) => country.code === value) || null
  const filteredCountries = useMemo(() => {
    const needle = normalized(query)
    if (!needle) return BILLING_COUNTRIES
    return BILLING_COUNTRIES.filter((country) => (
      normalized(country.name).includes(needle) || country.code.toLowerCase().includes(needle)
    ))
  }, [query])

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
        <Combobox.Label className="text-sm font-medium">Fatura ülkesi (ISO)</Combobox.Label>
        <div className="relative mt-1">
          <Combobox.Input
            className="w-full rounded-xl border border-[var(--billing-line)] bg-white px-3 py-2.5 pr-10 text-sm outline-none focus:border-[var(--billing-accent)] focus:ring-2 focus:ring-[var(--billing-accent-soft)] disabled:bg-gray-100"
            displayValue={(country) => country ? `${country.name} (${country.code})` : ''}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ülke adı veya ISO kodu ara"
            autoComplete="country-name"
            required={required}
          />
          <Combobox.Button className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3 text-[var(--billing-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--billing-accent)]">
            <ChevronUpDownIcon className="h-5 w-5" aria-hidden="true" />
          </Combobox.Button>
        </div>
        <Combobox.Options className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-[var(--billing-line)] bg-white p-1 shadow-xl focus:outline-none">
          {filteredCountries.length === 0 ? (
            <div className="px-3 py-4 text-sm text-[var(--billing-muted)]">Eşleşen ülke bulunamadı.</div>
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
