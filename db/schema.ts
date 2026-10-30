import {sqliteTable,text,integer,primaryKey,uniqueIndex} from 'drizzle-orm/sqlite-core';

export const healthConnections=sqliteTable('health_connections',{
  userId:text('user_id').primaryKey(),
  tokenHash:text('token_hash'),
  createdAt:text('created_at').notNull(),
  lastSync:text('last_sync'),
  lastError:text('last_error'),
  lastRecords:integer('last_records').notNull().default(0),
  lastMetrics:text('last_metrics'),
  bridgeSeenAt:text('bridge_seen_at'),
  bridgeStatus:text('bridge_status'),
  healthRevision:integer('health_revision').notNull().default(0),
},t=>[uniqueIndex('health_connection_token').on(t.tokenHash)]);

export const healthDaily=sqliteTable('health_daily',{
  userId:text('user_id').notNull(),
  date:text('date').notNull(),
  metric:text('metric').notNull(),
  value:text('value').notNull(),
  updatedAt:text('updated_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.date,t.metric]})]);

// Browser-authenticated personal records. A retained null value is a tombstone.
export const personalRecords=sqliteTable('personal_records',{
  userId:text('user_id').notNull(),
  recordKey:text('record_key').notNull(),
  value:text('value'),
  revision:integer('revision').notNull(),
  updatedAt:text('updated_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.recordKey]})]);

// Durable acknowledgements make a retry after a lost response harmless.
export const personalMutations=sqliteTable('personal_mutations',{
  sequence:integer('sequence').primaryKey({autoIncrement:true}),
  userId:text('user_id').notNull(),
  mutationId:text('mutation_id').notNull(),
  opHash:text('op_hash').notNull(),
  recordKey:text('record_key').notNull(),
  result:text('result').notNull(),
},t=>[uniqueIndex('personal_mutation_identity').on(t.userId,t.mutationId)]);

// Cloud recovery points contain records only: no connection tokens or receipts.
export const dataBackups=sqliteTable('data_backups',{
  userId:text('user_id').notNull(),
  id:text('id').notNull(),
  reason:text('reason').notNull(),
  createdAt:text('created_at').notNull(),
  payload:text('payload').notNull(),
},t=>[primaryKey({columns:[t.userId,t.id]})]);
export const dataActions=sqliteTable('data_actions',{
  userId:text('user_id').notNull(),
  id:text('id').notNull(),
  opHash:text('op_hash').notNull(),
  backupId:text('backup_id').notNull(),
  createdAt:text('created_at').notNull(),
  completed:integer('completed').notNull().default(0),
},t=>[primaryKey({columns:[t.userId,t.id]})]);

// Owner enrollment and durable results for unattended Site backup tasks.
export const backupJobs=sqliteTable('backup_jobs',{
  userId:text('user_id').primaryKey(),
  enabled:integer('enabled').notNull().default(0),
  lastAttempt:text('last_attempt'),
  lastSuccess:text('last_success'),
  lastError:text('last_error'),
  lastStatus:text('last_status').notNull().default('waiting'),
  lastRunDay:text('last_run_day'),
  lastBackupId:text('last_backup_id'),
  runId:text('run_id'),
});
