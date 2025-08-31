const mongoose = require('mongoose');
const { Schema } = mongoose;

const formResponseSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  formId: { type: Schema.Types.ObjectId, ref: 'FormDefinition', required: true },
  data: { type: Schema.Types.Mixed },
  files: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
  meta: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Index
formResponseSchema.index({ tenantId: 1, formId: 1, createdAt: -1 });

const FormResponse = mongoose.model('FormResponse', formResponseSchema);

module.exports = FormResponse;
