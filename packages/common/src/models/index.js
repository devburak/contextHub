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
const FormVersion = require('./FormVersion');
const Event = require('./Event');
const DailyAgg = require('./DailyAgg');
const ApiToken = require('./ApiToken');
const Product = require('./Product');
const CollectionType = require('./CollectionType');
const CollectionEntry = require('./CollectionEntry');
const Template = require('./Template');
const Content = require('./Content');
const ContentVersion = require('./ContentVersion');
const TenantSettings = require('./TenantSettings');
const FeatureFlagDefinition = require('./FeatureFlagDefinition');
const Gallery = require('./Gallery');
const PlacementDefinition = require('./PlacementDefinition');
const PlacementEvent = require('./PlacementEvent');
const Menu = require('./Menu');
const Role = require('./Role');

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
  FormVersion,
  Event,
  DailyAgg,
  ApiToken,
  Product,
  CollectionType,
  CollectionEntry,
  Template,
  Content,
  ContentVersion,
  TenantSettings,
  FeatureFlagDefinition,
  Gallery,
  PlacementDefinition,
  PlacementEvent,
  Menu,
  Role,
  mongoose
};
