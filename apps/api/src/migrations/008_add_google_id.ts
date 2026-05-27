import type { Knex } from 'knex';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('users', (table) => {
    table.text('google_id').nullable().unique();
    // Make auth_hash nullable so Google users can register before setting vault password
    table.text('auth_hash').nullable().alter();
  });
}
export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('users', (table) => {
    table.dropColumn('google_id');
  });
}
