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
const Term = require('./Term');
const Tag = require('./Tag');
const Navigation = require('./Navigation');
const Media = require('./Media');
const Category = require('./Category');
const FormDefinition = require('./FormDefinition');
const FormResponse = require('./FormResponse');
const Event = require('./Event');
const DailyAgg = require('./DailyAgg');
const ApiToken = require('./ApiToken');
const Product = require('./Product');
const CollectionDef = require('./CollectionDef');
const CollectionItem = require('./CollectionItem');
const Template = require('./Template');

module.exports = {
  Tenant,
  Domain,
  User,
  Membership,
  ContentType,
  Entry,
  EntryRevision,
  Taxonomy,
  Term,
  Tag,
  Navigation,
  Media,
  Category,
  FormDefinition,
  FormResponse,
  Event,
  DailyAgg,
  ApiToken,
  Product,
  CollectionDef,
  CollectionItem,
  Template,
  mongoose
};
