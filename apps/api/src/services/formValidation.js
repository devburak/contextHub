const { z } = require('zod');

/**
 * Field type enum
 */
const FieldType = z.enum([
  'text',
  'number',
  'select',
  'radio',
  'checkbox',
  'date',
  'file',
  'email',
  'phone',
  'rating',
  'hidden',
  'textarea',
  'section'
]);

/**
 * Conditional logic operator enum
 */
const ConditionalOperator = z.enum([
  'equals',
  'notEquals',
  'contains',
  'greaterThan',
  'lessThan',
  'isEmpty',
  'isNotEmpty'
]);

/**
 * i18n text schema (supports multiple languages)
 */
const i18nTextSchema = z.union([
  z.string(),
  z.record(z.string(), z.string())
]);

/**
 * Field option schema (for select, radio, checkbox)
 */
const fieldOptionSchema = z.object({
  value: z.string(),
  label: i18nTextSchema
});

/**
 * Field validation schema
 */
const fieldValidationSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  fileTypes: z.array(z.string()).optional(),
  maxFileSize: z.number().optional(),
  errorMessage: i18nTextSchema.optional()
}).optional();

/**
 * Conditional logic schema
 */
const conditionalLogicSchema = z.object({
  field: z.string(),
  operator: ConditionalOperator,
  value: z.any()
}).optional();

/**
 * Form field schema
 */
const formFieldSchema = z.object({
  id: z.string().optional(), // UUID or any string ID
  type: FieldType,
  name: z.string().min(1, 'Alan adı boş bırakılamaz'),
  label: i18nTextSchema.refine(val => {
    if (typeof val === 'string') return val.trim().length > 0;
    if (typeof val === 'object') {
      return Object.values(val).some(v => v && v.trim().length > 0);
    }
    return false;
  }, {
    message: 'Alan etiketi boş bırakılamaz'
  }),
  placeholder: i18nTextSchema.optional(),
  helpText: i18nTextSchema.optional(),
  required: z.boolean().default(false),
  validation: fieldValidationSchema,
  options: z.array(fieldOptionSchema).optional(),
  conditionalLogic: conditionalLogicSchema,
  defaultValue: z.any().optional(),
  order: z.number().default(0),
  width: z.enum(['full', 'half', 'third', 'quarter']).optional(),
  className: z.string().optional(),
  readOnly: z.boolean().optional(),
  disabled: z.boolean().optional(),
  hidden: z.boolean().optional()
});

/**
 * Email notifications schema
 */
const emailNotificationsSchema = z.object({
  enabled: z.boolean().default(false),
  recipients: z.array(
    z.string().refine(
      (val) => {
        // Form field reference: {field:fieldId}
        if (val.startsWith('{field:') && val.endsWith('}')) {
          return true;
        }
        // Normal email validation
        return z.string().email().safeParse(val).success;
      },
      {
        message: 'Geçersiz e-posta adresi veya form alanı referansı'
      }
    )
  ).optional(),
  subject: z.string().optional(),
  replyTo: z.union([z.string().email('Geçersiz yanıt e-posta adresi'), z.literal('')]).optional()
}).optional().refine(
  (data) => {
    // Eğer enabled false ise validation yapma
    if (!data || !data.enabled) return true;
    
    // Enabled true ise recipients zorunlu ve en az 1 email içermeli
    if (!data.recipients || data.recipients.length === 0) {
      return false;
    }
    
    // replyTo varsa ve boş string değilse email formatında olmalı
    if (data.replyTo && data.replyTo !== '') {
      return z.string().email().safeParse(data.replyTo).success;
    }
    
    return true;
  },
  {
    message: 'E-posta bildirimleri etkinse, en az bir alıcı e-posta adresi belirtmelisiniz'
  }
);

/**
 * Webhooks schema
 */
const webhooksSchema = z.object({
  enabled: z.boolean().default(false),
  url: z.union([z.string().url('Geçersiz webhook URL formatı'), z.literal('')]).optional(),
  events: z.array(z.string()).optional()
}).optional().refine(
  (data) => {
    // Eğer enabled false ise validation yapma
    if (!data || !data.enabled) return true;
    
    // Enabled true ise url zorunlu ve valid URL olmalı
    if (!data.url || data.url === '') {
      return false;
    }
    
    return z.string().url().safeParse(data.url).success;
  },
  {
    message: 'Webhook etkinse, geçerli bir URL belirtmelisiniz'
  }
);

/**
 * Form settings schema
 */
const formSettingsSchema = z.object({
  submitButtonText: i18nTextSchema.optional(),
  successMessage: i18nTextSchema.optional(),
  redirectUrl: z.string().optional().refine(val => !val || z.string().url().safeParse(val).success, {
    message: 'Geçersiz yönlendirme URL formatı'
  }),
  enableCaptcha: z.boolean().default(false),
  enableHoneypot: z.boolean().default(true),
  allowMultipleSubmissions: z.boolean().default(true),
  submitLimit: z.number().positive('Gönderim limiti pozitif bir sayı olmalıdır').optional(),
  requireAuthentication: z.boolean().default(false),
  collectGeo: z.boolean().default(false),
  collectDevice: z.boolean().default(true),
  enableFileUpload: z.boolean().default(false),
  maxFileSize: z.number().positive('Maksimum dosya boyutu pozitif bir sayı olmalıdır').optional(),
  allowedFileTypes: z.array(z.string()).optional(),
  emailNotifications: emailNotificationsSchema,
  webhooks: webhooksSchema
}).optional();

/**
 * Create form schema
 */
const createFormSchema = z.object({
  title: i18nTextSchema.refine(val => {
    if (typeof val === 'string') return val.trim().length > 0;
    if (typeof val === 'object') {
      return Object.values(val).some(v => v && v.trim().length > 0);
    }
    return false;
  }, {
    message: 'Form başlığı boş bırakılamaz'
  }),
  slug: z.string().optional(),
  description: i18nTextSchema.optional(),
  fields: z.array(formFieldSchema).default([]),
  settings: formSettingsSchema,
  visibility: z.enum(['public', 'authenticated']).default('public')
});

/**
 * Update form schema (all fields optional)
 */
const updateFormSchema = z.object({
  title: i18nTextSchema.optional(),
  slug: z.string().optional(),
  description: i18nTextSchema.optional(),
  fields: z.array(formFieldSchema).optional(),
  settings: formSettingsSchema,
  visibility: z.enum(['public', 'authenticated']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional()
});

/**
 * Build dynamic validation schema from form fields
 * This is used to validate form submissions
 */
function buildFormSubmissionSchema(fields) {
  const schema = {};
  
  fields.forEach(field => {
    // Skip non-input fields
    if (field.type === 'section') return;
    
    let fieldSchema;
    
    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'hidden':
        fieldSchema = z.string();
        if (field.validation?.min) {
          fieldSchema = fieldSchema.min(field.validation.min);
        }
        if (field.validation?.max) {
          fieldSchema = fieldSchema.max(field.validation.max);
        }
        if (field.validation?.pattern) {
          fieldSchema = fieldSchema.regex(new RegExp(field.validation.pattern));
        }
        break;
        
      case 'email':
        fieldSchema = z.string().email();
        break;
        
      case 'phone':
        fieldSchema = z.string().regex(/^[\d\s\-\+\(\)]+$/);
        break;
        
      case 'number':
      case 'rating':
        fieldSchema = z.number();
        if (field.validation?.min !== undefined) {
          fieldSchema = fieldSchema.min(field.validation.min);
        }
        if (field.validation?.max !== undefined) {
          fieldSchema = fieldSchema.max(field.validation.max);
        }
        break;
        
      case 'date':
        fieldSchema = z.string().datetime().or(z.date());
        break;
        
      case 'select':
      case 'radio':
        if (field.options && field.options.length > 0) {
          const validValues = field.options.map(opt => opt.value);
          fieldSchema = z.enum(validValues);
        } else {
          fieldSchema = z.string();
        }
        break;
        
      case 'checkbox':
        fieldSchema = z.array(z.string());
        if (field.validation?.min) {
          fieldSchema = fieldSchema.min(field.validation.min);
        }
        if (field.validation?.max) {
          fieldSchema = fieldSchema.max(field.validation.max);
        }
        break;
        
      case 'file':
        fieldSchema = z.object({
          mediaId: z.string(),
          filename: z.string(),
          size: z.number(),
          mimeType: z.string()
        }).or(z.array(z.object({
          mediaId: z.string(),
          filename: z.string(),
          size: z.number(),
          mimeType: z.string()
        })));
        break;
        
      default:
        fieldSchema = z.any();
    }
    
    // Make field required or optional
    if (field.required) {
      schema[field.id] = fieldSchema;
    } else {
      schema[field.id] = fieldSchema.optional();
    }
  });
  
  return z.object(schema);
}

/**
 * Validate form submission data
 */
function validateSubmission(fields, data) {
  const schema = buildFormSubmissionSchema(fields);
  return schema.parse(data);
}

/**
 * Safe validation that returns success/error object
 */
function validateSubmissionSafe(fields, data) {
  const schema = buildFormSubmissionSchema(fields);
  return schema.safeParse(data);
}

/**
 * Form response submission schema
 */
const formSubmissionSchema = z.object({
  data: z.record(z.any()), // Field ID to value mapping
  locale: z.string().default('en'),
  source: z.enum(['web', 'mobile', 'api', 'embed', 'unknown']).default('web'),
  captchaToken: z.string().optional(),
  honeypot: z.string().optional() // Should be empty
});

/**
 * Query parameters schema for form list
 */
const formListQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  search: z.string().optional()
});

/**
 * Query parameters schema for response list
 */
const responseListQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
  status: z.enum(['pending', 'processed', 'spam', 'deleted']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

module.exports = {
  FieldType,
  ConditionalOperator,
  i18nTextSchema,
  formFieldSchema,
  formSettingsSchema,
  createFormSchema,
  updateFormSchema,
  formSubmissionSchema,
  formListQuerySchema,
  responseListQuerySchema,
  buildFormSubmissionSchema,
  validateSubmission,
  validateSubmissionSafe
};
