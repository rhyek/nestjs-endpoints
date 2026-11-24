import { integer, pgEnum, pgTable, serial, text } from 'drizzle-orm/pg-core';

export const orderStatus = pgEnum('order_status', ['pending', 'paid', 'cancelled']);

export const orders = pgTable('orders', {
  id: serial().primaryKey(),
  productId: text().notNull(),
  quantity: integer().notNull(),
  status: orderStatus().notNull().default('pending'),
});

export const products = pgTable('products', {
  id: text().primaryKey(),
  name: text().notNull(),
  price: integer().notNull(),
});

export const members = pgTable('members', {
  id: serial().primaryKey(),
  teamId: text().notNull(),
  email: text().notNull(),
  role: text().notNull(),
});
