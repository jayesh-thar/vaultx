import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('users', (table) => {
    table.text('display_name').nullable();
    table.text('profile_photo').nullable(); // base64, max ~200KB enforced in API
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('users', (table) => {
    table.dropColumn('display_name');
    table.dropColumn('profile_photo');
  });
}
