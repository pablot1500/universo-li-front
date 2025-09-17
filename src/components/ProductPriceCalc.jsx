import React, { useState, useEffect } from 'react';
import ProductPriceCalc from '../components/ProductPriceCalc';

const ProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [detailProduct, setDetailProduct] = useState(null);

  useEffect(() => {
    // Fetch products data
    fetch('/api/products')
      .then(res => res.json())
      .then(data => setProducts(data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div>
      <h1>Products</h1>
      <ul>
        {products.map(product => (
          <li key={product.id} onClick={() => setDetailProduct(product)}>
            {product.name}
          </li>
        ))}
      </ul>

      {detailProduct && (
        <div className="modal">
          <button onClick={() => setDetailProduct(null)}>Close</button>
          <div style={{ marginLeft: '40px' }}>
            <h2>{detailProduct.name}</h2>
            <div>
              {/* Tables markup */}
              <h3>Materiales - Otros Materiales</h3>
              <table>
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {detailProduct.materials.map((mat) => (
                    <tr key={mat.id}>
                      <td>{mat.name}</td>
                      <td>{mat.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table>
                <thead>
                  <tr>
                    <th>Otros Materiales</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {detailProduct.otherMaterials.map((mat) => (
                    <tr key={mat.id}>
                      <td>{mat.name}</td>
                      <td>{mat.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: '16px'
              }}>
                <div style={{
                  width: '100px',
                  height: '100px',
                  border: '1px solid #ccc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {detailProduct.image ? (
                    <img src={detailProduct.image} alt={detailProduct.name} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                  ) : (
                    'Imagen'
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
