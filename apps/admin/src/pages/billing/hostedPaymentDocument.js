// iyzico checkoutFormContent is a script fragment. The responsive mount must
// exist before those scripts run, including for subscription/card-update forms.
// Keep the provider document inside the opaque-origin sandbox, never the admin DOM.
export function hostedPaymentDocument(content, language = 'tr') {
  const lang = language === 'en' ? 'en' : 'tr'
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${lang === 'en' ? 'Secure payment' : 'Güvenli ödeme'}</title>
  <style>html,body{margin:0;min-height:100%;}body{padding:16px;box-sizing:border-box;}</style>
</head>
<body>
  <div id="iyzipay-checkout-form" class="responsive"></div>
  ${content}
</body>
</html>`
}
