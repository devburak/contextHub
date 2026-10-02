import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createFormSchema, updateFormSchema, buildFormSubmissionSchema } = require('./formValidation');
const FormDefinition = require('../../../../packages/common/src/models/FormDefinition');

const field = {
  id: 'message', name: 'message', type: 'textarea', label: { tr: 'Mesaj' },
  helpText: { tr: 'Açıklama', en: 'Description' },
  validation: { minLength: 0, maxLength: 5, pattern: '^[a-z]*$', errorMessage: { tr: 'Geçersiz mesaj' } }
};

describe('form field properties', () => {
  it('preserves properties through create, database hydration, update and reload', () => {
    const payload = createFormSchema.parse({ title: 'Form', fields: [field] });
    const doc = new FormDefinition({ ...payload, slug: 'form' });
    const stored = JSON.parse(JSON.stringify(doc.toObject()));
    expect(stored.fields[0]).toMatchObject(field);
    const updated = updateFormSchema.parse({ fields: [{ ...stored.fields[0], validation: { ...field.validation, maxLength: 10 } }] });
    doc.set(updated);
    const reloaded = FormDefinition.hydrate(JSON.parse(JSON.stringify(doc.toObject())));
    expect(reloaded.fields[0].validation.maxLength).toBe(10);
    expect(reloaded.fields[0].helpText).toEqual(field.helpText);
    expect(reloaded.fields[0].validation.errorMessage).toEqual(field.validation.errorMessage);
  });
  it('enforces length and pattern on submissions keyed by field name', () => {
    const schema = buildFormSubmissionSchema([field], 'name');
    expect(schema.safeParse({ message: 'abc' }).success).toBe(true);
    expect(schema.safeParse({ message: 'abcdef' }).success).toBe(false);
    expect(schema.safeParse({ message: 'ABC' }).success).toBe(false);
    expect(schema.safeParse({ message: '' }).success).toBe(true);
  });
  it('enforces zero numeric limits and preserves them in the model', () => {
    const number = { ...field, type: 'number', validation: { min: -5, max: 0 } };
    const schema = buildFormSubmissionSchema([number], 'name');
    expect(schema.safeParse({ message: 0 }).success).toBe(true);
    expect(schema.safeParse({ message: 1 }).success).toBe(false);
    expect(new FormDefinition({ fields: [number] }).fields[0].validation.max).toBe(0);
  });
  it('applies length rules to email and phone and rejects invalid regex at save time', () => {
    for (const type of ['email', 'phone']) {
      const schema = buildFormSubmissionSchema([{ ...field, type, validation: { maxLength: 3 } }], 'name');
      expect(schema.safeParse({ message: type === 'email' ? 'a@b.com' : '12345' }).success).toBe(false);
    }
    expect(createFormSchema.safeParse({ title: 'Form', fields: [{ ...field, validation: { pattern: '[' } }] }).success).toBe(false);
  });
});
