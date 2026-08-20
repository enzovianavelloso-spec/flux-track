-- Mapeia todos os 6 produtos reais do GGCheckout (Acalanto) pro pixel Meta.
-- Rodar no Neon SQL Editor (console.neon.tech) ou via psql "$DATABASE_URL" -f scripts/set-meta-pixel.sql
-- Idempotente: pode rodar de novo sem problema.

insert into products (id, name, meta_pixel_id) values
  ('5koiJIsjDvoHoErIUGyz', 'Os 7 Ajustes do Quarto', '2093293154728170'),
  ('Hbixl5ImHR9Q6gWStvw9', 'Acalanto Essencial', '2093293154728170'),
  ('Oxd63SKXXA77EFkbaWDh', 'Acalanto Completo', '2093293154728170'),
  ('ZPucAUyZJoG2HSRS0CFJ', 'Despertador Âncora', '2093293154728170'),
  ('aTbHwTQNDXKlDmepmQKk', 'Kit Noite Inteira', '2093293154728170'),
  ('lUyyK52Ec2DON50PdCrl', 'Acalanto Essencial + Sons', '2093293154728170')
on conflict (id) do update set meta_pixel_id = excluded.meta_pixel_id;

-- Confirma:
select id, name, meta_pixel_id from products order by name;
