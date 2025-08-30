const mongoose = require('mongoose');

// Model dosyalarını import edelim
const Tenant = require('./Tenant');
const Domain = require('./Domain');
const User = require('./User');
const Membership = require('./Membership');
const ContentType = require('./ContentType');
const Entry = require('./Entry');
const EntryRevision = require('./EntryRevision');
const Taxonomy = require('./Taxonomy');

module.exports = {
  Tenant,
  Domain,
  User,
  Membership,
  ContentType,
  Entry,
  EntryRevision,
  Taxonomy,
  mongoose
};
