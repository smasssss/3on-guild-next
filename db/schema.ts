// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const documents = sqliteTable('documents', {
  kind: text('kind').primaryKey(), revision: integer('revision').notNull(),
  payload: text('payload').notNull(), updatedAt: text('updated_at').notNull(),
  actor: text('actor').notNull(), lastMutation: text('last_mutation').notNull(),
});
export const backups = sqliteTable('backups', {
  mutation: text('mutation').primaryKey(), kind: text('kind').notNull(),
  revision: integer('revision').notNull(), payload: text('payload').notNull(),
  savedAt: text('saved_at').notNull(), actor: text('actor').notNull(),
});
export const credentials = sqliteTable('credentials', {
  hash: text('hash').primaryKey(), type: text('type').notNull(),
  user: text('user').notNull(), challenge: text('challenge').notNull(),
  expires: integer('expires').notNull(),
});
export const authAttempts = sqliteTable('auth_attempts', {
  scope: text('scope').primaryKey(), count: integer('count').notNull(),
  resetAt: integer('reset_at').notNull(),
});
