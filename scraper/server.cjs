// server.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = 3001; // Puedes cambiarlo si ya usás este puerto para otra cosa

app.use(cors());

/**
 * Endpoint que recibe una URL de Casanacho y devuelve el precio extraído
 * Ejemplo de uso: GET /api/precio-casanacho?url=https://www.casanacho.com.ar/productos/silver/
 */
app.get('/api/precio-casanacho', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'Falta el parámetro "url"' });
    }

    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        const priceString = $('#price_display').attr('data-product-price');
        const price = priceString ? parseFloat(priceString) / 100 : null;

        if (price !== null) {
            res.json({ price });
        } else {
            res.status(404).json({ error: 'No se encontró el precio en la página' });
        }
    } catch (error) {
        console.error('Error al obtener la página:', error);
        res.status(500).json({ error: 'Error al procesar la página de Casanacho' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor de scraping corriendo en http://localhost:${PORT}`);
});