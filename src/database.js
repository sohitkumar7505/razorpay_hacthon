import pg from "pg";

const { Pool } = pg;

const schema = `
CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shopping_sessions (
  id text PRIMARY KEY,
  customer_id text REFERENCES customers(id),
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  customer_id text,
  payment_id text,
  status text NOT NULL,
  total integer NOT NULL,
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchant_settings (
  id text PRIMARY KEY,
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);`;

export class CommerceDatabase {
  constructor(connectionString = process.env.DATABASE_URL) {
    this.pool = new Pool({ connectionString });
  }

  async initialize() {
    await this.pool.query(schema);
  }

  async saveCustomer(customer) {
    await this.pool.query(
      `INSERT INTO customers (id, name, email, preferences) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,preferences=EXCLUDED.preferences`,
      [customer.id, customer.name, customer.email, customer.preferences ?? {}]
    );
  }

  async listCustomers() {
    const { rows } = await this.pool.query("SELECT id,name,email,preferences FROM customers ORDER BY created_at");
    return rows;
  }

  async saveSession(state) {
    await this.pool.query(
      `INSERT INTO shopping_sessions (id, customer_id, state) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET customer_id=EXCLUDED.customer_id,state=EXCLUDED.state,updated_at=now()`,
      [state.id, state.customerId ?? null, state]
    );
  }

  async loadSessions() {
    const { rows } = await this.pool.query("SELECT state FROM shopping_sessions ORDER BY updated_at");
    return rows.map(({ state }) => state);
  }

  async saveOrder(order) {
    await this.pool.query(
      `INSERT INTO orders (id,session_id,customer_id,payment_id,status,total,snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET payment_id=EXCLUDED.payment_id,status=EXCLUDED.status,snapshot=EXCLUDED.snapshot,updated_at=now()`,
      [order.id, order.sessionId, order.customerId ?? null, order.paymentId ?? null, order.status, order.total, order]
    );
  }

  async ordersForCustomer(customerId) {
    const { rows } = await this.pool.query("SELECT snapshot FROM orders WHERE customer_id=$1 ORDER BY updated_at DESC", [customerId]);
    return rows.map(({ snapshot }) => snapshot);
  }

  async saveSettings(settings) {
    await this.pool.query(
      `INSERT INTO merchant_settings (id,settings) VALUES ('default',$1)
       ON CONFLICT (id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()`, [settings]
    );
  }

  async loadSettings() {
    const { rows } = await this.pool.query("SELECT settings FROM merchant_settings WHERE id='default'");
    return rows[0]?.settings;
  }

  async saveProduct(product) {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS products (id text PRIMARY KEY, product jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`
    );
    await this.pool.query(
      `INSERT INTO products (id,product) VALUES ($1,$2)
       ON CONFLICT (id) DO UPDATE SET product=EXCLUDED.product,updated_at=now()`, [product.id, product]
    );
  }

  async deleteProduct(id) {
    await this.pool.query("DELETE FROM products WHERE id=$1", [id]);
  }

  async loadProducts() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS products (id text PRIMARY KEY, product jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await this.pool.query("SELECT product FROM products ORDER BY updated_at");
    return rows.map(({ product }) => product);
  }

  async close() { await this.pool.end(); }
}
