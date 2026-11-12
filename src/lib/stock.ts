// SQL expression for "how many in stock" for a product row aliased as p.
export const STOCK_SQL = `CASE WHEN p.is_service THEN NULL WHEN p.track_serial
  THEN (SELECT count(*)::int FROM units u WHERE u.product_id = p.id AND u.status = 'in_stock')
  ELSE p.stock_qty END`;
