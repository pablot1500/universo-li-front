import React, { useEffect, useMemo, useState } from 'react';
import { computeSaleFinancials } from '../utils/salePayments';

const StatsPage = () => {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filtros
  const todayStr = new Date().toISOString().split('T')[0];
  const firstOfMonthStr = (() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  })();
  const [startDate, setStartDate] = useState(firstOfMonthStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [metric, setMetric] = useState('profit'); // 'profit' | 'cost'
  const metricLabels = {
    profit: 'Ganancia real',
    cost: 'Costo materiales',
  };
  const getMetricValue = (record) => {
    if (!record) return 0;
    if (metric === 'profit') return Number(record.profit) || 0;
    return Number(record.cost) || 0;
  };

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [resSales, resProducts] = await Promise.all([
          fetch('/api/sales'),
          fetch('/api/products')
        ]);
        if (!resSales.ok || !resProducts.ok) throw new Error('Error cargando datos');
        const [salesData, productsData] = await Promise.all([resSales.json(), resProducts.json()]);
        setSales(salesData || []);
        setProducts(productsData || []);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const clampRange = (s, e) => {
    if (!s && !e) return [null, null];
    const sd = s ? new Date(s) : null;
    const ed = e ? new Date(e) : null;
    if (sd && ed && ed < sd) return [ed, sd];
    return [sd, ed];
  };

  const getSaleMetrics = (sale, financials) => {
    const fin = financials || computeSaleFinancials(sale);
    const costMaterials = fin.costMaterials;
    const realSaleValue = fin.realSaleValue !== null ? fin.realSaleValue : fin.effectiveSaleValue;
    const realProfit = realSaleValue - costMaterials;
    return { costMaterials, realSaleValue, realProfit };
  };

  const joinedSales = useMemo(() => {
    const map = new Map(products.map(p => [String(p.id), p]));
    return (sales || []).map(s => ({
      ...s,
      product: map.get(String(s.productId)) || null
    }));
  }, [sales, products]);

  const enrichedSales = useMemo(() => {
    return joinedSales.map(sale => ({
      ...sale,
      financials: computeSaleFinancials(sale)
    }));
  }, [joinedSales]);

  const [sd, ed] = clampRange(startDate, endDate);

  // Presets de rango rápido
  const setPresetRange = (preset) => {
    const now = new Date();
    const toISO = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().split('T')[0];
    const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
    if (preset === 'today') {
      const t = toISO(now);
      setStartDate(t); setEndDate(t); return;
    }
    if (preset === '7d') {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      setStartDate(toISO(s)); setEndDate(toISO(now)); return;
    }
    if (preset === '30d') {
      const s = new Date(now); s.setDate(s.getDate() - 29);
      setStartDate(toISO(s)); setEndDate(toISO(now)); return;
    }
    if (preset === 'thisMonth') {
      setStartDate(toISO(startOfMonth(now))); setEndDate(toISO(now)); return;
    }
    if (preset === 'lastMonth') {
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setStartDate(toISO(startOfMonth(last))); setEndDate(toISO(endOfMonth(last))); return;
    }
    if (preset === 'thisYear') {
      const s = new Date(now.getFullYear(), 0, 1);
      setStartDate(toISO(s)); setEndDate(toISO(now)); return;
    }
    if (preset === 'all') {
      setStartDate(''); setEndDate(''); return;
    }
  };

  const filteredSales = useMemo(() => {
    const byDate = enrichedSales.filter(s => {
      if (!sd && !ed) return true;
      const d = s.date ? new Date(s.date) : null;
      if (!d) return false;
      const afterStart = sd ? d >= sd : true;
      const beforeEnd = ed ? d <= ed : true;
      return afterStart && beforeEnd;
    });
    return byDate.filter(s => s.financials.paymentStatus === 'Pagado');
  }, [enrichedSales, sd, ed]);

  const filteredSalesWithMetrics = useMemo(() => {
    return filteredSales.map(s => ({
      ...s,
      metrics: getSaleMetrics(s, s.financials)
    }));
  }, [filteredSales]);

  const kpis = useMemo(() => {
    const count = filteredSalesWithMetrics.length;
    let profitSum = 0;
    let costSum = 0;
    for (const sale of filteredSalesWithMetrics) {
      const { realProfit, costMaterials } = sale.metrics;
      profitSum += realProfit;
      costSum += costMaterials;
    }
    const avgProfit = count ? profitSum / count : 0;
    const avgCost = count ? costSum / count : 0;
    return {
      count,
      totalProfit: profitSum,
      totalCost: costSum,
      avgProfit,
      avgCost,
    };
  }, [filteredSalesWithMetrics]);

  const paymentBreakdown = useMemo(() => {
    const counts = new Map();
    let total = 0;
    for (const s of filteredSales) {
      const key = s.paymentMethod || 'Otro';
      counts.set(key, (counts.get(key) || 0) + 1);
      total++;
    }
    const entries = Array.from(counts.entries()).map(([method, cnt]) => ({ method, count: cnt, pct: total ? (cnt * 100) / total : 0 }));
    entries.sort((a, b) => b.count - a.count);
    return { total, entries };
  }, [filteredSales]);

  const byCategory = useMemo(() => {
    const acc = new Map();
    for (const sale of filteredSalesWithMetrics) {
      const cat = sale.product?.category || 'Sin categoría';
      const cur = acc.get(cat) || { profit: 0, cost: 0 };
      cur.profit += sale.metrics.realProfit;
      cur.cost += sale.metrics.costMaterials;
      acc.set(cat, cur);
    }
    const rows = Array.from(acc.entries()).map(([category, vals]) => ({ category, ...vals }));
    const field = metric === 'profit' ? 'profit' : 'cost';
    rows.sort((a, b) => b[field] - a[field]);
    return rows;
  }, [filteredSalesWithMetrics, metric]);

  const byProduct = useMemo(() => {
    const acc = new Map();
    for (const sale of filteredSalesWithMetrics) {
      const name = sale.product?.name || `#${sale.productId}`;
      const cur = acc.get(name) || { profit: 0, cost: 0 };
      cur.profit += sale.metrics.realProfit;
      cur.cost += sale.metrics.costMaterials;
      acc.set(name, cur);
    }
    const rows = Array.from(acc.entries()).map(([product, vals]) => ({ product, ...vals }));
    const field = metric === 'profit' ? 'profit' : 'cost';
    rows.sort((a, b) => b[field] - a[field]);
    return rows.slice(0, 5);
  }, [filteredSalesWithMetrics, metric]);

  const dailySeries = useMemo(() => {
    const acc = new Map();
    for (const sale of filteredSalesWithMetrics) {
      const key = sale.date || '—';
      const current = acc.get(key) || { profit: 0, cost: 0 };
      current.profit += sale.metrics.realProfit;
      current.cost += sale.metrics.costMaterials;
      acc.set(key, current);
    }
    const rows = Array.from(acc.entries()).map(([date, data]) => ({ date, ...data }));
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  }, [filteredSalesWithMetrics]);

  // Estilos simples
  const cardStyle = { padding: 12, border: '1px solid #eee', borderRadius: 8, background: '#fff' };
  const sectionStyle = { marginTop: 16 };

  if (loading) return <div>Cargando estadísticas…</div>;
  if (error) return <div>Error: {error}</div>;

  const palette = ['#00a2ff', '#ff7a59', '#00c49f', '#ffbb28', '#8884d8', '#82ca9d', '#ff8042'];
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
  const halfCardStyle = { ...cardStyle, boxSizing: 'border-box' };
  const graphHeight = isMobile ? 140 : 180;
  const maxCategoryRows = 10;
  const maxDailyRows = 30;
  const visibleByCategory = byCategory.slice(0, maxCategoryRows);
  const visibleDailySeries = dailySeries.length > maxDailyRows
    ? dailySeries.slice(dailySeries.length - maxDailyRows)
    : dailySeries;
  const maxDaily = visibleDailySeries.reduce((m, r) => Math.max(m, getMetricValue(r)), 0);
  const maxCat = visibleByCategory.reduce((m, r) => Math.max(m, getMetricValue(r)), 0);
  const maxProd = byProduct.reduce((m, r) => Math.max(m, getMetricValue(r)), 0);

  return (
    <div>
      <h1>Estadísticas</h1>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: '#555' }}>Desde</label><br />
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#555' }}>Hasta</label><br />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#555' }}>Métrica</label><br />
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="profit">Ganancia real</option>
            <option value="cost">Costo materiales</option>
          </select>
        </div>
        {/* Presets */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <button onClick={() => setPresetRange('today')}>Hoy</button>
          <button onClick={() => setPresetRange('7d')}>7 días</button>
          <button onClick={() => setPresetRange('30d')}>30 días</button>
          <button onClick={() => setPresetRange('thisMonth')}>Mes actual</button>
          <button onClick={() => setPresetRange('lastMonth')}>Mes anterior</button>
          <button onClick={() => setPresetRange('thisYear')}>Año actual</button>
          <button onClick={() => setPresetRange('all')}>Todo</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#777' }}>Ganancia real total</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>$ {kpis.totalProfit.toFixed(2)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#777' }}>Costo materiales total</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>$ {kpis.totalCost.toFixed(2)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#777' }}>Ganancia real promedio</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>$ {kpis.avgProfit.toFixed(2)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#777' }}>Costo materiales promedio</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>$ {kpis.avgCost.toFixed(2)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#777' }}>Ventas</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{kpis.count}</div>
        </div>
      </div>

      {/* Fila de gráficos: Métodos de pago (dona) + Top 5 productos (barras) */}
      <div style={{ ...sectionStyle }}>
        <div className="stats-two-col">
          {/* Métodos de pago - dona */}
          <div style={halfCardStyle}>
            <div style={{ marginBottom: 32, fontWeight: 600 }}>Métodos de pago</div>
            {paymentBreakdown.entries.length === 0 ? (
              <div style={{ color: '#777' }}>Sin datos</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: (isMobile ? 12 : 16), flexWrap: 'wrap', padding: (isMobile ? '24px 12px 10px' : '28px 20px 12px'), justifyContent: 'center' }}>
                {(() => {
                  const total = paymentBreakdown.entries.reduce((a, e) => a + e.count, 0);
                  let accPct = 0;
                  const segments = paymentBreakdown.entries.map((e, idx) => {
                    const start = accPct;
                    const end = accPct + e.pct; // en %
                    accPct = end;
                    const color = palette[idx % palette.length];
                    return `${color} ${start}% ${end}%`;
                  }).join(', ');
                  const size = isMobile ? 96 : 160;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: (isMobile ? 8 : 16), flexDirection: (isMobile ? 'column' : 'row') }}>
                      <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', background: `conic-gradient(${segments})` }}>
                        <div style={{ position: 'absolute', inset: (isMobile ? 12 : 16), borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: (isMobile ? 12 : 14), color: '#555' }}>
                          {total} ventas
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: (isMobile ? 'center' : 'flex-start') }}>
                        {paymentBreakdown.entries.map((e, idx) => (
                          <div key={e.method} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 10, height: 10, background: palette[idx % palette.length], borderRadius: 2 }} />
                            <div style={{ width: (isMobile ? undefined : 120), textAlign: (isMobile ? 'center' : 'left') }}>{e.method}</div>
                            <div style={{ width: (isMobile ? undefined : 80), textAlign: (isMobile ? 'center' : 'right'), fontSize: 12 }}>{e.pct.toFixed(1)}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Top 5 productos - barras verticales con etiquetas */}
          <div style={halfCardStyle}>
            <div style={{ marginBottom: 32, fontWeight: 600 }}>Top 5 productos ({metricLabels[metric]})</div>
            {byProduct.length === 0 ? (
              <div style={{ color: '#777' }}>Sin datos</div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: (isMobile ? 6 : 12), height: graphHeight, padding: (isMobile ? '20px 12px 10px' : '28px 20px 12px'), justifyContent: 'center' }}>
                  {byProduct.map((r, idx) => {
                    const val = getMetricValue(r);
                    const h = maxProd ? Math.max(2, (val * graphHeight) / maxProd) : 2;
                    const color = palette[idx % palette.length];
                    return (
                      <div key={r.product} style={{ width: (isMobile ? 48 : 68), display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ position: 'relative', width: '100%', height: graphHeight }}>
                          <div title={`${r.product} • $ ${val.toFixed(2)}`}
                               style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 0, width: (isMobile ? 16 : 24), height: h, background: color, borderRadius: 3 }} />
                          <div style={{ position: 'absolute', bottom: h + 2, left: '50%', transform: 'translateX(-50%)', fontSize: (isMobile ? 9 : 10), color: '#555', whiteSpace: 'nowrap' }}>
                            {Math.round(val).toLocaleString('es-AR')}
                          </div>
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: (isMobile ? 9 : 10),
                            color: '#666',
                            textAlign: 'center',
                            width: '100%',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere',
                            lineHeight: 1.2,
                          }}
                          title={r.product}
                        >
                          {r.product}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Por categoría - barras con colores */}
      <div style={{ ...sectionStyle, ...cardStyle }}>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>Por categoría ({metricLabels[metric]})</div>
        {byCategory.length === 0 ? (
          <div style={{ color: '#777' }}>Sin datos</div>
        ) : (
          <div>
            {visibleByCategory.map((r, idx) => {
              const val = getMetricValue(r);
              const pct = maxCat > 0 ? Math.min(100, (val * 100) / maxCat) : 0;
              const color = palette[idx % palette.length];
              return (
                <div key={r.category} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>{r.category}</span>
                    <span>$ {val.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 10, background: '#f2f2f2', borderRadius: 6 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6 }} />
                  </div>
                </div>
              );
            })}
            {byCategory.length > maxCategoryRows && (
              <div style={{ color: '#999', fontSize: 12, marginTop: 6 }}>otras categorías omitidas por espacio</div>
            )}
          </div>
        )}
      </div>

      {/* Serie diaria - barras horizontales (similar a Por categoría) */}
      <div style={{ ...sectionStyle, ...cardStyle }}>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>{`${metricLabels[metric]} por día`}</div>
        {dailySeries.length === 0 ? (
          <div style={{ color: '#777' }}>Sin datos</div>
        ) : (
          <div>
            {visibleDailySeries.map((r, idx) => {
              const val = getMetricValue(r);
              const pct = maxDaily > 0 ? Math.min(100, (val * 100) / maxDaily) : 0;
              const color = palette[idx % palette.length];
              return (
                <div key={r.date} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>{r.date}</span>
                    <span>$ {val.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 10, background: '#f2f2f2', borderRadius: 6 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6 }} />
                  </div>
                </div>
              );
            })}
            {dailySeries.length > maxDailyRows && (
              <div style={{ color: '#999', fontSize: 12, marginTop: 6 }}>otros días omitidos por espacio</div>
            )}
          </div>
        )}
      </div>

      {/* Ventas recientes */}
      <div style={{ ...sectionStyle, ...cardStyle }}>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>Ventas recientes</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Fecha</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Producto</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #eee', padding: 8 }}>Costo materiales</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #eee', padding: 8 }}>Ganancia real</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Pago</th>
              </tr>
            </thead>
            <tbody>
              {filteredSalesWithMetrics
                .slice()
                .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                .slice(0, 10)
                .map(s => (
                  <tr key={s.id}>
                    <td style={{ padding: 8 }}>{s.date}</td>
                    <td style={{ padding: 8 }}>{s.product?.name || `#${s.productId}`}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>$ {s.metrics.costMaterials.toFixed(2)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>$ {s.metrics.realProfit.toFixed(2)}</td>
                    <td style={{ padding: 8 }}>{s.paymentMethod || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
};

export default StatsPage;
