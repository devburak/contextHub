const { z } = require('zod');
const { CollectionType } = require('@contexthub/common');

const FIELD_TYPES = CollectionType.FIELD_TYPES;

const localizedMapSchema = z
  .record(z.string(), z.string())
  .superRefine((value, ctx) => {
    if (!value || Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one locale value is required'
      });
    }
  });

const fieldOptionSchema = z.object({
  value: z.string().min(1, 'Option value is required'),
  label: localizedMapSchema.optional()
});

const fieldSchema = z.object({
  key: z.string().min(1, 'Field key is required'),
  type: z.enum(FIELD_TYPES, { errorMap: () => ({ message: 'Invalid field type' }) }),
  label: localizedMapSchema.optional(),
  description: localizedMapSchema.optional(),
  options: fieldOptionSchema.array().optional(),
  ref: z.string().min(1, 'Referenced collection key is required').optional(),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  indexed: z.boolean().optional(),
  defaultValue: z.any().optional(),
  settings: z.any().optional()
}).superRefine((value, ctx) => {
  if (value.type === 'enum' && (!value.options || value.options.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enum fields require at least one option',
      path: ['options']
    });
  }

  if (value.type === 'ref' && !value.ref) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Reference fields must declare target collection key via ref',
      path: ['ref']
    });
  }
});

const collectionSettingsSchema = z.object({
  slugField: z.string().optional(),
  defaultSort: z.object({
    key: z.string(),
    dir: z.enum(['asc', 'desc']).default('asc')
  }).optional(),
  enableVersioning: z.boolean().optional(),
  allowDrafts: z.boolean().optional(),
  previewUrlTemplate: z.string().optional()
}).optional();

const createCollectionSchema = z.object({
  key: z.string().regex(/^[a-zA-Z0-9-_]+$/, 'Key can only include alphanumeric characters, dash and underscore'),
  name: localizedMapSchema,
  description: localizedMapSchema.optional(),
  fields: fieldSchema.array().max(50, 'Collections support up to 50 fields').optional().default([]),
  settings: collectionSettingsSchema,
  status: z.enum(['active', 'archived']).optional()
});

const updateCollectionSchema = createCollectionSchema.partial().extend({
  fields: fieldSchema.array().max(50, 'Collections support up to 50 fields').optional()
});

const relationRefSchema = z.object({
  collectionKey: z.string().min(1),
  entryId: z.string().min(1),
  relationType: z.string().optional()
});

const entryPayloadSchema = z.object({
  slug: z.string().max(150).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  data: z.record(z.string(), z.any()).default({}),
  relations: z.object({
    contents: z.array(z.string()).optional(),
    media: z.array(z.string()).optional(),
    refs: z.array(relationRefSchema).optional()
  }).optional()
});

const entryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  sort: z.string().optional(),
  q: z.string().optional(),
  filter: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
});

const queryOperatorSchema = z.enum(['=', '!=', 'IN', 'NIN', '>', '>=', '<', '<=', 'LIKE']);

const queryConditionSchema = z.tuple([
  z.string().min(1, 'Alan adı gerekli'),
  queryOperatorSchema,
  z.any()
]);

const orderBySchema = z.tuple([
  z.string().min(1, 'Sıralama alanı gerekli'),
  z.enum(['asc', 'desc']).default('asc')
]);

const collectionQuerySchema = z.object({
  collection: z.string().min(1, 'collection parametresi zorunlu'),
  select: z.array(z.string().min(1)).max(50).optional(),
  where: z.array(queryConditionSchema).max(20).optional(),
  orderBy: z.array(orderBySchema).max(3).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
  page: z.number().int().min(1).optional(),
  includeRelations: z.array(z.enum(['media', 'contents', 'refs'])).optional()
});

module.exports = {
  FIELD_TYPES,
  fieldSchema,
  createCollectionSchema,
  updateCollectionSchema,
  entryPayloadSchema,
  entryListQuerySchema,
  collectionQuerySchema,
  queryOperatorSchema
};
